import os


def _load_env(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

BASE_URL = os.environ.get("VETSOFT_BASE_URL", "https://api.vetsoft.com.br")
TENANT = os.environ.get("VETSOFT_TENANT", "caoecia")
EMAIL = os.environ.get("VETSOFT_EMAIL", "")
PASSWORD = os.environ.get("VETSOFT_PASSWORD", "")

SYNC_INTERVAL_SECONDS = int(os.environ.get("SYNC_INTERVAL_SECONDS", "15"))
DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "queue.db"))

ADMIN_PIN = os.environ.get("ADMIN_PIN", "")