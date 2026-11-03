import os
from datetime import datetime, timedelta, timezone

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # Python < 3.9
    ZoneInfo = None
    ZoneInfoNotFoundError = Exception


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

# Credenciais de acesso por papel (variáveis do EasyPanel)
ADMIN_USER = os.environ.get("ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
RECEPCAO_USER = os.environ.get("RECEPCAO_USER", "")
RECEPCAO_PASSWORD = os.environ.get("RECEPCAO_PASSWORD", "")
ATENDENTE_USER = os.environ.get("ATENDENTE_USER", "")
ATENDENTE_PASSWORD = os.environ.get("ATENDENTE_PASSWORD", "")

# Sessão (cookie assinado)
SESSION_SECRET = os.environ.get("SESSION_SECRET", "")
SESSION_HOURS = int(os.environ.get("SESSION_HOURS", "12"))

# Desativa o loop de sincronização com o VetSoft (usado em testes)
DISABLE_SYNC = os.environ.get("DISABLE_SYNC", "") == "1"

# Fuso do negócio — define o "dia" dos agendamentos (independente do TZ do host)
BUSINESS_TZ = os.environ.get("BUSINESS_TZ", "America/Sao_Paulo")


def _business_tzinfo():
    if ZoneInfo is not None:
        try:
            return ZoneInfo(BUSINESS_TZ)
        except (ZoneInfoNotFoundError, ValueError):
            pass
    return timezone(timedelta(hours=-3))  # fallback: Brasil (UTC-3, sem DST)


def business_today() -> str:
    """Data de hoje (Y-m-d) no fuso do negócio."""
    return datetime.now(_business_tzinfo()).date().isoformat()