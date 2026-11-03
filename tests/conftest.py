import os
import tempfile
from pathlib import Path

import pytest

# Ambiente de teste — definido ANTES de importar config/app.
_tmp = Path(tempfile.mkdtemp(prefix="caocia-test-"))
os.environ["DB_PATH"] = str(_tmp / "test.db")
os.environ["SESSION_SECRET"] = "test-secret"
os.environ["ADMIN_USER"] = "admin"
os.environ["ADMIN_PASSWORD"] = "adminpw"
os.environ["RECEPCAO_USER"] = "recepcao"
os.environ["RECEPCAO_PASSWORD"] = "recepw"
os.environ["ATENDENTE_USER"] = "atendente"
os.environ["ATENDENTE_PASSWORD"] = "atendpw"
os.environ["SESSION_HOURS"] = "12"
os.environ["DISABLE_SYNC"] = "1"

import db  # noqa: E402
import auth  # noqa: E402
import config  # noqa: E402
import app as app_module  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

CREDS = {
    "admin": ("admin", "adminpw"),
    "recepcao": ("recepcao", "recepw"),
    "atendente": ("atendente", "atendpw"),
}


@pytest.fixture(autouse=True)
def fresh_db():
    db.init_db()
    conn = db.get_conn()
    for table in ("attendances", "queue_items", "attendants"):
        conn.execute(f"DELETE FROM {table}")
    conn.commit()
    db._services_names_cache = None
    db._animals_ident_cache = None
    app_module._login_fails.clear()
    app_module._pin_fails.clear()
    yield


@pytest.fixture
def client():
    return TestClient(app_module.app)


@pytest.fixture
def login_as():
    def _login(client, role):
        user, pw = CREDS[role]
        r = client.post("/api/login", json={"username": user, "password": pw, "role": role})
        assert r.status_code == 200, r.text
        return client
    return _login


@pytest.fixture
def make_attendant():
    def _make(nome="Ana", pin="1111"):
        h, s = auth.hash_pin(pin)
        return db.create_attendant(nome, h, s)
    return _make


@pytest.fixture
def add_queue_item():
    def _add(cod_evento, status="presente", data=None, checked_in=None, obs=None):
        data = data or config.business_today()
        conn = db.get_conn()
        conn.execute(
            """
            INSERT INTO queue_items
                (cod_evento, nom_animal, nom_cliente, dat_evento, status, checked_in_at,
                 obs_estetica, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """,
            (cod_evento, f"PET{cod_evento}", f"Tutor {cod_evento}", f"{data} 08:00:00",
             status, checked_in, obs),
        )
        conn.commit()
    return _add