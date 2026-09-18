import hashlib
import os
import hmac

import db

_ITERATIONS = 200_000


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