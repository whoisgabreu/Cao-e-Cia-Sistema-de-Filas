import hashlib
import hmac
import os
import time

import config
import db

_ITERATIONS = 200_000

ROLE_ADMIN = "admin"
ROLE_RECEPCAO = "recepcao"
ROLE_ATENDENTE = "atendente"
ROLES = (ROLE_ADMIN, ROLE_RECEPCAO, ROLE_ATENDENTE)

# ----------------------------------------------------------------------
# PIN (atendentes — ações)
# ----------------------------------------------------------------------
def hash_pin(pin: str, salt: str | None = None) -> tuple[str, str]:
    salt = salt or os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), _ITERATIONS)
    return digest.hex(), salt


def verify_pin(pin: str, pin_hash: str, pin_salt: str) -> bool:
    computed, _ = hash_pin(pin, pin_salt)
    return hmac.compare_digest(computed, pin_hash)


def authenticate_attendant(pin: str) -> dict | None:
    """Retorna o atendente cujo PIN bate, ou None."""
    if not pin:
        return None
    for attendant in db.get_attendants():
        row = db.get_attendant(attendant["id"])
        if row and verify_pin(pin, row["pin_hash"], row["pin_salt"]):
            return attendant
    return None


# ----------------------------------------------------------------------
# Login por papel (credenciais do .env)
# ----------------------------------------------------------------------
def _creds_for(role: str) -> tuple[str, str]:
    if role == ROLE_ADMIN:
        return config.ADMIN_USER, config.ADMIN_PASSWORD
    if role == ROLE_RECEPCAO:
        return config.RECEPCAO_USER, config.RECEPCAO_PASSWORD
    if role == ROLE_ATENDENTE:
        return config.ATENDENTE_USER, config.ATENDENTE_PASSWORD
    return "", ""


def authenticate_user(username: str, password: str, role: str) -> bool:
    if role not in ROLES:
        return False
    user, pwd = _creds_for(role)
    if not user or not pwd:
        return False
    return hmac.compare_digest(username or "", user) and hmac.compare_digest(password or "", pwd)


# ----------------------------------------------------------------------
# Sessão — cookie assinado HMAC: "role.exp.sig"
# ----------------------------------------------------------------------
def _hmac(payload: str) -> str:
    return hmac.new(config.SESSION_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()


def sign_session(role: str, ttl_seconds: int | None = None) -> str:
    ttl = ttl_seconds or (config.SESSION_HOURS * 3600)
    exp = int(time.time()) + ttl
    payload = f"{role}.{exp}"
    return f"{payload}.{_hmac(payload)}"


def validate_session(cookie: str | None) -> str | None:
    """Retorna o papel da sessão, ou None se inválida/expirada."""
    if not cookie or not config.SESSION_SECRET:
        return None
    try:
        role, exp, sig = cookie.split(".")
        if role not in ROLES:
            return None
        if not hmac.compare_digest(sig, _hmac(f"{role}.{exp}")):
            return None
        if int(exp) < int(time.time()):
            return None
        return role
    except (ValueError, TypeError):
        return None