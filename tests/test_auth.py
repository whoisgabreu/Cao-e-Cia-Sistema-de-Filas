"""Autenticação por papel, proteção de rotas e rate-limit de login."""
CREDS = {
    "admin": ("admin", "adminpw"),
    "recepcao": ("recepcao", "recepw"),
    "atendente": ("atendente", "atendpw"),
}


def test_login_and_me_para_cada_papel(client):
    for role, (user, pw) in CREDS.items():
        r = client.post("/api/login", json={"username": user, "password": pw, "role": role})
        assert r.status_code == 200, r.text
        assert r.json()["data"]["role"] == role
        me = client.get("/api/me")
        assert me.status_code == 200
        assert me.json()["data"]["role"] == role


def test_login_senha_errada(client):
    r = client.post("/api/login", json={"username": "admin", "password": "xxxx", "role": "admin"})
    assert r.status_code == 401


def test_login_papel_invalido(client):
    r = client.post("/api/login", json={"username": "admin", "password": "adminpw", "role": "hacker"})
    assert r.status_code == 401


def test_sem_sessao_bloqueia_api_e_paginas(client):
    assert client.get("/api/queue").status_code == 401
    assert client.get("/api/me").status_code == 401
    # Raiz deslogada → redireciona para /login
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/login"
    # Tela de login acessível
    assert client.get("/login").status_code == 200
    # Área admin sem sessão → /login
    r = client.get("/audit", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/login"


def test_logado_em_login_redireciona_para_home(client, login_as):
    expected = {"admin": "/audit", "recepcao": "/", "atendente": "/atendente-minimalista"}
    for role, home in expected.items():
        login_as(client, role)
        r = client.get("/login", follow_redirects=False)
        assert r.status_code == 302, role
        assert r.headers["location"] == home


def test_login_auto_detect_por_credenciais(client):
    expected = {"admin": "/audit", "recepcao": "/", "atendente": "/atendente-minimalista"}
    for role, (user, pw) in CREDS.items():
        r = client.post("/api/login", json={"username": user, "password": pw})
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["role"] == role
        assert data["home"] == expected[role]


def test_rotas_login_legacy_continuam(client):
    for path in ("/login-recepcao", "/login-admin", "/login-atendente"):
        assert client.get(path).status_code == 200


def test_recepcao_nao_acessa_auditoria(client, login_as):
    login_as(client, "recepcao")
    assert client.get("/").status_code == 200
    assert client.get("/api/queue").status_code == 200
    r = client.get("/audit", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/"
    assert client.get("/api/audit").status_code == 401


def test_atendente_nao_acessa_recepcao(client, login_as):
    login_as(client, "atendente")
    assert client.get("/atendente-minimalista").status_code == 200
    r = client.get("/", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/atendente-minimalista"


def test_admin_acessa_tudo(client, login_as):
    login_as(client, "admin")
    for path in ("/", "/audit", "/attendants", "/atendente-minimalista"):
        assert client.get(path).status_code == 200, path
    assert client.get("/api/attendants").status_code == 200


def test_ferramentas_removida(client):
    assert client.get("/ferramentas").status_code == 404


def test_debug_oculto_exige_admin(client, login_as):
    r = client.get("/debug", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/login"

    for role in ("recepcao", "atendente"):
        login_as(client, role)
        assert client.get("/debug", follow_redirects=False).status_code == 302

    login_as(client, "admin")
    assert client.get("/debug").status_code == 200


def test_auditoria_sem_limpeza_e_debug_com_limpeza(client, login_as):
    login_as(client, "admin")
    audit = client.get("/audit").text
    debug = client.get("/debug").text
    assert "Limpeza" not in audit
    assert "btn-queue" not in audit
    assert "Limpeza" in debug
    assert "btn-queue" in debug


def test_rate_limit_login(client):
    for _ in range(5):
        r = client.post("/api/login", json={"username": "admin", "password": "errada", "role": "admin"})
        assert r.status_code == 401
    r = client.post("/api/login", json={"username": "admin", "password": "adminpw", "role": "admin"})
    assert r.status_code == 429


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_pin_unico_no_cadastro(client, login_as, make_attendant):
    make_attendant("Ana", "1111")
    login_as(client, "admin")
    r = client.post("/api/attendants", json={"nome": "Bia", "pin": "1111"})
    assert r.status_code == 409
    ok = client.post("/api/attendants", json={"nome": "Bia", "pin": "2222"})
    assert ok.status_code == 201


def test_pin_unico_na_atualizacao(client, login_as, make_attendant):
    make_attendant("Ana", "1111")
    bia = make_attendant("Bia", "2222")
    login_as(client, "admin")
    r = client.put(f"/api/attendants/{bia['id']}", json={"pin": "1111"})
    assert r.status_code == 409
    # atualizar mantendo o próprio PIN é permitido
    ok = client.put(f"/api/attendants/{bia['id']}", json={"pin": "2222"})
    assert ok.status_code == 200


def test_rate_limit_acoes_com_pin(client, login_as, make_attendant):
    make_attendant("Ana", "1111")
    login_as(client, "atendente")
    for _ in range(10):
        r = client.post("/api/queue/next", json={"pin": "9999"})
        assert r.status_code == 401
    r = client.post("/api/queue/next", json={"pin": "1111"})
    assert r.status_code == 429