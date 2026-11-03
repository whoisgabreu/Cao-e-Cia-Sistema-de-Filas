"""Auditoria: série diária e limpeza protegida pela senha do administrador."""
import db


def _attendance(attendant_id, cod_evento, finished_at):
    conn = db.get_conn()
    conn.execute(
        """
        INSERT INTO attendances
            (cod_evento, attendant_id, nom_attendant, nom_cliente, nom_animal,
             services, claimed_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            cod_evento,
            attendant_id,
            "Ana",
            f"Tutor {cod_evento}",
            f"PET{cod_evento}",
            "[]",
            finished_at,
            finished_at,
        ),
    )
    conn.commit()


def test_audit_serie_agrupa_por_dia(client, login_as, make_attendant):
    att = make_attendant("Ana", "1111")
    _attendance(att["id"], 1, "2026-01-01 10:00:00")
    _attendance(att["id"], 2, "2026-01-01 11:00:00")
    _attendance(att["id"], 3, "2026-01-03 09:00:00")

    login_as(client, "admin")
    r = client.get("/api/audit/serie?dat_inicio=2026-01-01&dat_fim=2026-01-03")
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert [(d["data"], d["total"]) for d in data] == [
        ("2026-01-01", 2),
        ("2026-01-03", 1),
    ]
    assert data[0]["tempo_medio_min"] == 0


def test_audit_serie_filtra_por_atendente(client, login_as, make_attendant):
    ana = make_attendant("Ana", "1111")
    bia = make_attendant("Bia", "2222")
    _attendance(ana["id"], 1, "2026-01-01 10:00:00")
    _attendance(bia["id"], 2, "2026-01-01 11:00:00")

    login_as(client, "admin")
    r = client.get(f"/api/audit/serie?cod_atendente={ana['id']}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["total"] == 1


def test_clear_exige_senha_do_admin(client, login_as):
    login_as(client, "admin")

    sem_senha = client.post("/api/debug/clear-audit", json={})
    assert sem_senha.status_code == 422

    errada = client.post("/api/debug/clear-audit", json={"password": "errada"})
    assert errada.status_code == 401

    ok = client.post("/api/debug/clear-audit", json={"password": "adminpw"})
    assert ok.status_code == 200, ok.text


def test_clear_bloqueia_apos_tentativas(client, login_as):
    login_as(client, "admin")
    for _ in range(5):
        r = client.post("/api/debug/clear-audit", json={"password": "errada"})
        assert r.status_code == 401
    r = client.post("/api/debug/clear-audit", json={"password": "adminpw"})
    assert r.status_code == 429
