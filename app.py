import os
import threading
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import config
import db
import export_xlsx
import sync

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
SESSION_COOKIE = "session"

HOME_BY_ROLE = {
    auth.ROLE_RECEPCAO: "/",
    auth.ROLE_ATENDENTE: "/atendente-minimalista",
    auth.ROLE_ADMIN: "/audit",
}
LOGIN_BY_ROLE = {
    auth.ROLE_RECEPCAO: "/login-recepcao",
    auth.ROLE_ATENDENTE: "/login-atendente",
    auth.ROLE_ADMIN: "/login-admin",
}


def _session_cookie(role: str, response: Response, secure: bool = False, max_age: int | None = None) -> None:
    ttl = max_age if max_age is not None else config.SESSION_HOURS * 3600
    value = auth.sign_session(role, ttl)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=value,
        max_age=ttl,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
    )


def _is_https(request: Request) -> bool:
    return request.url.scheme == "https" or str(request.headers.get("x-forwarded-proto", "")).lower() == "https"


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/")


def current_role(request: Request) -> str | None:
    return auth.validate_session(request.cookies.get(SESSION_COOKIE))


def require_role(*roles: str):
    def dep(request: Request) -> str:
        role = current_role(request)
        if role not in roles:
            raise HTTPException(401, "Não autorizado")
        return role
    return dep


def require_any_session(request: Request) -> str:
    role = current_role(request)
    if role is None:
        raise HTTPException(401, "Não autorizado")
    return role

_stop_sync = threading.Event()

# Rate-limit de login: 5 falhas / 15 min por IP.
_LOGIN_WINDOW = 15 * 60
_LOGIN_MAX_FAILS = 5
_login_fails: dict[str, list[float]] = {}
_login_lock = threading.Lock()


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


def _login_blocked(ip: str) -> bool:
    now = time.time()
    with _login_lock:
        fails = [t for t in _login_fails.get(ip, []) if now - t < _LOGIN_WINDOW]
        _login_fails[ip] = fails
        return len(fails) >= _LOGIN_MAX_FAILS


def _login_register_fail(ip: str) -> None:
    now = time.time()
    with _login_lock:
        fails = [t for t in _login_fails.get(ip, []) if now - t < _LOGIN_WINDOW]
        fails.append(now)
        _login_fails[ip] = fails


def _login_reset(ip: str) -> None:
    with _login_lock:
        _login_fails.pop(ip, None)


def _validate_config() -> None:
    if not config.SESSION_SECRET:
        print("[app] AVISO: SESSION_SECRET vazio — o login não funcionará. Defina no ambiente.")
    missing = [
        name
        for name, val in (
            ("ADMIN_USER/ADMIN_PASSWORD", config.ADMIN_USER and config.ADMIN_PASSWORD),
            ("RECEPCAO_USER/RECEPCAO_PASSWORD", config.RECEPCAO_USER and config.RECEPCAO_PASSWORD),
            ("ATENDENTE_USER/ATENDENTE_PASSWORD", config.ATENDENTE_USER and config.ATENDENTE_PASSWORD),
        )
        if not val
    ]
    if missing:
        print(f"[app] AVISO: credenciais ausentes no ambiente: {', '.join(missing)}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    _validate_config()
    if config.DISABLE_SYNC:
        print("[app] sincronização desativada (DISABLE_SYNC=1)")
        yield
        return
    thread = threading.Thread(
        target=sync.sync_loop,
        args=(_stop_sync, config.SYNC_INTERVAL_SECONDS),
        daemon=True,
        name="vetsoft-sync",
    )
    thread.start()
    print(f"[app] sincronização a cada {config.SYNC_INTERVAL_SECONDS}s (tenant={config.TENANT})")
    yield
    _stop_sync.set()


app = FastAPI(title="Fila Banho & Tosa - Cão & Cia", lifespan=lifespan)


@app.middleware("http")
async def session_renewal(request: Request, call_next):
    """Renova a sessão (sliding 12h) a cada requisição autenticada."""
    response = await call_next(request)
    if request.url.path in ("/api/login", "/api/logout"):
        return response
    role = current_role(request)
    if role:
        _session_cookie(role, response, secure=_is_https(request))
    return response


@app.middleware("http")
async def static_no_cache(request: Request, call_next):
    """Força revalidação dos estáticos (evita CSS/JS antigos após deploy)."""
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-cache"
    return response


# ----------------------------------------------------------------------
# Modelos
# ----------------------------------------------------------------------
class AttendantCreate(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    pin: str = Field(min_length=4, max_length=6, pattern=r"^\d+$")


class AttendantUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    pin: str | None = Field(default=None, min_length=4, max_length=6, pattern=r"^\d+$")


class PinAction(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r"^\d+$")


class CancelAction(BaseModel):
    motivo: str | None = Field(default=None, max_length=200)


class PrioridadeAction(BaseModel):
    ativo: bool = True


class LoginPayload(BaseModel):
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=20)


# ----------------------------------------------------------------------
# Autenticação
# ----------------------------------------------------------------------
@app.post("/api/login")
def api_login(payload: LoginPayload, request: Request, response: Response):
    if not config.SESSION_SECRET:
        raise HTTPException(503, "Login não configurado (SESSION_SECRET).")
    ip = _client_ip(request)
    if _login_blocked(ip):
        raise HTTPException(429, "Muitas tentativas. Tente novamente em alguns minutos.")
    if not auth.authenticate_user(payload.username, payload.password, payload.role):
        _login_register_fail(ip)
        raise HTTPException(401, "Usuário ou senha inválidos.")
    _login_reset(ip)
    _session_cookie(payload.role, response, secure=_is_https(request))
    return {"data": {"role": payload.role, "home": HOME_BY_ROLE[payload.role]}}


@app.post("/api/logout")
def api_logout(response: Response):
    _clear_session_cookie(response)
    return {"data": {"ok": True}}


@app.get("/api/me")
def api_me(request: Request):
    role = current_role(request)
    if role is None:
        raise HTTPException(401, "Não autenticado")
    return {"data": {"role": role}}


@app.get("/healthz", include_in_schema=False)
def healthz():
    try:
        db.get_conn().execute("SELECT 1").fetchone()
        return {"status": "ok"}
    except Exception:  # noqa: BLE001
        return Response(content='{"status":"error"}', status_code=503, media_type="application/json")


def _protected_page(path: str, allowed: tuple[str, ...]):
    def handler(request: Request):
        role = current_role(request)
        if role in allowed:
            return FileResponse(os.path.join(STATIC_DIR, path))
        if role:
            # Autenticado, mas sem permissão nesta tela → vai para a tela do próprio papel.
            return RedirectResponse(HOME_BY_ROLE.get(role, "/"), status_code=302)
        # Sem sessão → login do papel exigido.
        return RedirectResponse(LOGIN_BY_ROLE[allowed[0]], status_code=302)
    return handler


# ----------------------------------------------------------------------
# Páginas
# ----------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def index(request: Request):
    return _protected_page("index.html", (auth.ROLE_RECEPCAO, auth.ROLE_ADMIN))(request)


@app.get("/audit", include_in_schema=False)
def audit_page(request: Request):
    return _protected_page("audit.html", (auth.ROLE_ADMIN,))(request)


@app.get("/attendants", include_in_schema=False)
def attendants_page(request: Request):
    return _protected_page("attendants.html", (auth.ROLE_ADMIN,))(request)


@app.get("/ferramentas", include_in_schema=False)
def ferramentas_page(request: Request):
    return _protected_page("ferramentas.html", (auth.ROLE_ADMIN,))(request)


@app.get("/atendente", include_in_schema=False)
def atendente_page(request: Request):
    return _protected_page("atendente.html", (auth.ROLE_ATENDENTE, auth.ROLE_ADMIN))(request)


@app.get("/atendente-minimalista", include_in_schema=False)
def atendente_minimal_page(request: Request):
    return _protected_page("atendente-minimal.html", (auth.ROLE_ATENDENTE, auth.ROLE_ADMIN))(request)


@app.get("/login-recepcao", include_in_schema=False)
def login_recepcao():
    return FileResponse(os.path.join(STATIC_DIR, "login.html"))


@app.get("/login-admin", include_in_schema=False)
def login_admin():
    return FileResponse(os.path.join(STATIC_DIR, "login.html"))


@app.get("/login-atendente", include_in_schema=False)
def login_atendente():
    return FileResponse(os.path.join(STATIC_DIR, "login.html"))


@app.get("/manifest.webmanifest", include_in_schema=False)
def manifest():
    return FileResponse(
        os.path.join(STATIC_DIR, "manifest.webmanifest"),
        media_type="application/manifest+json",
    )


@app.get("/sw.js", include_in_schema=False)
def service_worker():
    return FileResponse(os.path.join(STATIC_DIR, "sw.js"), media_type="application/javascript")


# ----------------------------------------------------------------------
# API local
# ----------------------------------------------------------------------
@app.get("/api/queue", dependencies=[Depends(require_any_session)])
def api_queue():
    return {"data": db.get_queue()}


@app.get("/api/attendants", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_attendants(incluir_inativos: bool = False):
    return {"data": db.get_attendants(incluir_inativos=incluir_inativos)}


@app.post("/api/attendants", status_code=201, dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_create_attendant(payload: AttendantCreate):
    pin_hash, pin_salt = auth.hash_pin(payload.pin)
    attendant = db.create_attendant(payload.nome.strip(), pin_hash, pin_salt)
    return {"data": attendant}


@app.put("/api/attendants/{attendant_id}", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_update_attendant(attendant_id: int, payload: AttendantUpdate):
    if payload.nome is None and payload.pin is None:
        raise HTTPException(422, "Informe ao menos um campo para atualizar")
    pin_hash, pin_salt = None, None
    if payload.pin is not None:
        pin_hash, pin_salt = auth.hash_pin(payload.pin)
    attendant = db.update_attendant(
        attendant_id,
        nome=payload.nome.strip() if payload.nome is not None else None,
        pin_hash=pin_hash,
        pin_salt=pin_salt,
    )
    if attendant is None:
        raise HTTPException(404, "Atendente não encontrado")
    return {"data": {"id": attendant["id"], "nome": attendant["nome"], "ativo": attendant["ativo"]}}


@app.delete("/api/attendants/{attendant_id}", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_deactivate_attendant(attendant_id: int):
    attendant = db.get_attendant(attendant_id)
    if attendant is None:
        raise HTTPException(404, "Atendente não encontrado")
    if db.count_em_atendimento(attendant_id) > 0:
        raise HTTPException(409, "Atendente possui atendimento em andamento")
    db.set_attendant_ativo(attendant_id, False)
    return {"data": {"id": attendant_id, "ativo": False}}


@app.post("/api/attendants/{attendant_id}/reativar", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_reactivate_attendant(attendant_id: int):
    attendant = db.get_attendant(attendant_id)
    if attendant is None:
        raise HTTPException(404, "Atendente não encontrado")
    db.set_attendant_ativo(attendant_id, True)
    return {"data": {"id": attendant_id, "ativo": True}}


@app.post("/api/queue/{cod_evento}/claim", dependencies=[Depends(require_any_session)])
def api_claim(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    result = db.claim_evento(cod_evento, attendant["id"])
    if result == "ja_em_atendimento":
        raise HTTPException(409, "Você já está em um atendimento. Finalize-o antes de pegar outro.")
    if result == "nao_presente":
        raise HTTPException(409, "Pet ainda não marcado como presente. Marque \"Chegou\" primeiro.")
    return {"data": {"cod_evento": cod_evento, "status": "em_atendimento", "attendant": attendant["nome"]}}


@app.post("/api/queue/{cod_evento}/checkin", dependencies=[Depends(require_any_session)])
def api_checkin(cod_evento: int):
    result = db.checkin_evento(cod_evento)
    if result == "nao_disponivel":
        raise HTTPException(409, "Atendimento não está aguardando na fila")
    return {"data": {"cod_evento": cod_evento, "status": "presente"}}


@app.post(
    "/api/queue/{cod_evento}/prioridade",
    dependencies=[Depends(require_role(auth.ROLE_RECEPCAO, auth.ROLE_ADMIN))],
)
def api_prioridade(cod_evento: int, payload: PrioridadeAction):
    result = db.set_prioridade(cod_evento, payload.ativo)
    if result == "nao_encontrado":
        raise HTTPException(404, "Atendimento não encontrado")
    if result == "nao_disponivel":
        raise HTTPException(409, "Só é possível priorizar pets aguardando ou presentes de hoje.")
    return {"data": {"cod_evento": cod_evento, "is_prioridade": payload.ativo}}


@app.post("/api/queue/{cod_evento}/cancel", dependencies=[Depends(require_any_session)])
def api_cancel(cod_evento: int, payload: CancelAction | None = None):
    motivo = (payload.motivo or "").strip() if payload else ""
    result = db.cancel_evento(cod_evento, motivo or None)
    if result == "nao_encontrado":
        raise HTTPException(404, "Agendamento não encontrado")
    if result == "ja_cancelado":
        raise HTTPException(409, "Este atendimento já está cancelado.")
    if result == "ja_finalizado":
        raise HTTPException(409, "Atendimento já finalizado; não dá para cancelar.")
    return {"data": {"cod_evento": cod_evento, "status": "cancelado"}}


@app.post("/api/queue/{cod_evento}/restore", dependencies=[Depends(require_any_session)])
def api_restore(cod_evento: int):
    result = db.restore_evento(cod_evento)
    if result == "vetsoft":
        raise HTTPException(409, "Este agendamento foi cancelado no VetSoft. Reative por lá que ele volta para a fila.")
    if result == "nao_disponivel":
        raise HTTPException(409, "Este atendimento não está cancelado.")
    return {"data": {"cod_evento": cod_evento, "status": "aguardando"}}


@app.post("/api/queue/{cod_evento}/start", dependencies=[Depends(require_any_session)])
def api_start(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    result = db.start_evento(cod_evento, attendant["id"])
    if result == "ja_em_atendimento":
        raise HTTPException(409, "Você já está em um atendimento. Finalize-o antes de iniciar outro.")
    if result == "nao_disponivel":
        raise HTTPException(409, "Pet não está mais disponível na fila")
    return {"data": {"cod_evento": cod_evento, "status": "em_atendimento", "attendant": attendant["nome"]}}


@app.post("/api/queue/next", dependencies=[Depends(require_any_session)])
def api_next(payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    result = db.start_next_evento(attendant["id"])
    if result == "ja_em_atendimento":
        raise HTTPException(409, "Você já está em um atendimento.")
    if result == "fila_vazia":
        raise HTTPException(409, "Fila vazia.")
    _, item = result
    animal = db.get_animals_ident().get(item.get("cod_animal")) or {}
    return {
        "data": {
            "cod_evento": item["cod_evento"],
            "status": "em_atendimento",
            "pet": item["nom_animal"],
            "tutor": item["nom_cliente"],
            "services": [s.get("nom_prod_serv") for s in item["services"]],
            "claimed_at": item["claimed_at"],
            "attendant": attendant["nome"],
            "obs_estetica": item.get("obs_estetica"),
            "obs_animal": animal.get("obs_animal"),
            "num_identificacao": animal.get("num_identificacao"),
        }
    }


@app.post("/api/queue/finish/prepare", dependencies=[Depends(require_any_session)])
def api_finish_prepare(payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    item = db.finish_prepare(attendant["id"])
    if item is None:
        raise HTTPException(409, "Você não está com nenhum pet em atendimento. Só quem pegou o pet pode finalizar.")
    return {
        "data": {
            "cod_evento": item["cod_evento"],
            "pet": item["nom_animal"],
            "tutor": item["nom_cliente"],
            "services": [s.get("nom_prod_serv") for s in item["services"]],
            "claimed_at": item["claimed_at"],
            "duracao_min": item["duracao_min"],
        }
    }


@app.post("/api/queue/finish", dependencies=[Depends(require_any_session)])
def api_finish(payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    item = db.checkout_by_attendant(attendant["id"])
    if item is None:
        raise HTTPException(409, "Você não está com nenhum pet em atendimento. Só quem pegou o pet pode finalizar.")
    return {
        "data": {
            "cod_evento": item["cod_evento"],
            "status": "concluido",
            "pet": item["nom_animal"],
            "attendant": attendant["nome"],
        }
    }


@app.post("/api/queue/{cod_evento}/checkout", dependencies=[Depends(require_any_session)])
def api_checkout(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    item = db.checkout_evento(cod_evento, attendant["id"])
    if item is None:
        raise HTTPException(409, "Este pet está com outro atendente. Só quem pegou o pet pode finalizar.")
    return {"data": {"cod_evento": cod_evento, "status": "concluido", "attendant": attendant["nome"]}}


@app.post("/api/sync", dependencies=[Depends(require_any_session)])
def api_sync():
    try:
        result = sync.sync_queue()
        return {"data": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Falha ao sincronizar com VetSoft: {exc}")


@app.get("/api/audit", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_audit(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    detalhado: bool = False,
    cod_atendente: int | None = None,
):
    if detalhado:
        return {"data": db.get_audit_detalhado(dat_inicio, dat_fim, cod_atendente)}
    return {"data": db.get_audit(dat_inicio, dat_fim, cod_atendente)}


@app.get("/api/audit/export.xlsx", include_in_schema=True, dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_audit_export(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    cod_atendente: int | None = None,
):
    content, filename = export_xlsx.build_audit_workbook(dat_inicio, dat_fim, cod_atendente)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ----------------------------------------------------------------------
# Ferramentas / Debug (protegidas por sessão admin)
# ----------------------------------------------------------------------
@app.get("/api/debug/status", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_debug_status():
    return {"data": db.count_all()}


@app.post("/api/debug/clear-queue", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_debug_clear_queue():
    cleared = db.clear_queue()
    synced = sync.sync_queue()
    return {"data": {"limpos": cleared, "sync": synced, "status": db.count_queue()}}


@app.post("/api/debug/clear-audit", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_debug_clear_audit():
    return {"data": {"limpos": db.clear_attendances()}}


@app.post("/api/debug/clear-all", dependencies=[Depends(require_role(auth.ROLE_ADMIN))])
def api_debug_clear_all():
    q = db.clear_queue()
    a = db.clear_attendances()
    synced = sync.sync_queue()
    return {"data": {"fila_limpa": q, "auditoria_limpa": a, "sync": synced, "status": db.count_all()}}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")