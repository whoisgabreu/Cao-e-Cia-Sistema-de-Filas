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
    r = client.get("/audit", follow_redirects=False)
    assert r.status_code == 302
    assert r.headers["location"] == "/login-admin"


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
    for path in ("/", "/audit", "/attendants", "/ferramentas", "/atendente-minimalista"):
        assert client.get(path).status_code == 200, path
    assert client.get("/api/attendants").status_code == 200


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