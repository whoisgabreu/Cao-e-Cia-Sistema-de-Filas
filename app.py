import hmac
import os
import threading
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import config
import db
import sync

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")

_stop_sync = threading.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
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


def require_admin(x_admin_pin: str = Header(default="")) -> None:
    if not config.ADMIN_PIN:
        raise HTTPException(503, "ADMIN_PIN não configurado no ambiente")
    if not hmac.compare_digest(x_admin_pin, config.ADMIN_PIN):
        raise HTTPException(401, "PIN de administrador inválido")


# ----------------------------------------------------------------------
# Páginas
# ----------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))


@app.get("/audit", include_in_schema=False)
def audit_page():
    return FileResponse(os.path.join(STATIC_DIR, "audit.html"))


@app.get("/attendants", include_in_schema=False)
def attendants_page():
    return FileResponse(os.path.join(STATIC_DIR, "attendants.html"))


@app.get("/ferramentas", include_in_schema=False)
def ferramentas_page():
    return FileResponse(os.path.join(STATIC_DIR, "ferramentas.html"))


@app.get("/atendente", include_in_schema=False)
def atendente_page():
    return FileResponse(os.path.join(STATIC_DIR, "atendente.html"))


@app.get("/atendente-minimalista", include_in_schema=False)
def atendente_minimal_page():
    return FileResponse(os.path.join(STATIC_DIR, "atendente-minimal.html"))


# ----------------------------------------------------------------------
# API local
# ----------------------------------------------------------------------
@app.get("/api/queue")
def api_queue():
    return {"data": db.get_queue()}


@app.post("/api/admin/check", dependencies=[Depends(require_admin)])
def api_admin_check():
    return {"data": {"ok": True}}


@app.get("/api/attendants", dependencies=[Depends(require_admin)])
def api_attendants(incluir_inativos: bool = False):
    return {"data": db.get_attendants(incluir_inativos=incluir_inativos)}


@app.post("/api/attendants", status_code=201, dependencies=[Depends(require_admin)])
def api_create_attendant(payload: AttendantCreate):
    pin_hash, pin_salt = auth.hash_pin(payload.pin)
    attendant = db.create_attendant(payload.nome.strip(), pin_hash, pin_salt)
    return {"data": attendant}


@app.put("/api/attendants/{attendant_id}", dependencies=[Depends(require_admin)])
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


@app.delete("/api/attendants/{attendant_id}", dependencies=[Depends(require_admin)])
def api_deactivate_attendant(attendant_id: int):
    attendant = db.get_attendant(attendant_id)
    if attendant is None:
        raise HTTPException(404, "Atendente não encontrado")
    if db.count_em_atendimento(attendant_id) > 0:
        raise HTTPException(409, "Atendente possui atendimento em andamento")
    db.set_attendant_ativo(attendant_id, False)
    return {"data": {"id": attendant_id, "ativo": False}}


@app.post("/api/attendants/{attendant_id}/reativar", dependencies=[Depends(require_admin)])
def api_reactivate_attendant(attendant_id: int):
    attendant = db.get_attendant(attendant_id)
    if attendant is None:
        raise HTTPException(404, "Atendente não encontrado")
    db.set_attendant_ativo(attendant_id, True)
    return {"data": {"id": attendant_id, "ativo": True}}


@app.post("/api/queue/{cod_evento}/claim")
def api_claim(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN inválido")
    result = db.claim_evento(cod_evento, attendant["id"])
    if result == "ja_em_atendimento":
        raise HTTPException(409, "Você já está em um atendimento. Finalize-o antes de pegar outro.")
    if result == "nao_presente":
        raise HTTPException(409, "Pet ainda não marcado como presente. Marque \"Chegou\" primeiro.")
    return {"data": {"cod_evento": cod_evento, "status": "em_atendimento", "attendant": attendant["nome"]}}


@app.post("/api/queue/{cod_evento}/checkin")
def api_checkin(cod_evento: int):
    result = db.checkin_evento(cod_evento)
    if result == "nao_disponivel":
        raise HTTPException(409, "Atendimento não está aguardando na fila")
    return {"data": {"cod_evento": cod_evento, "status": "presente"}}


@app.post("/api/queue/{cod_evento}/start")
def api_start(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN inválido")
    result = db.start_evento(cod_evento, attendant["id"])
    if result == "ja_em_atendimento":
        raise HTTPException(409, "Você já está em um atendimento. Finalize-o antes de iniciar outro.")
    if result == "nao_disponivel":
        raise HTTPException(409, "Pet não está mais disponível na fila")
    return {"data": {"cod_evento": cod_evento, "status": "em_atendimento", "attendant": attendant["nome"]}}


@app.post("/api/queue/next")
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
    return {
        "data": {
            "cod_evento": item["cod_evento"],
            "status": "em_atendimento",
            "pet": item["nom_animal"],
            "tutor": item["nom_cliente"],
            "services": [s.get("nom_prod_serv") for s in item["services"]],
            "claimed_at": item["claimed_at"],
            "attendant": attendant["nome"],
        }
    }


@app.post("/api/queue/finish/prepare")
def api_finish_prepare(payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN incorreto.")
    item = db.finish_prepare(attendant["id"])
    if item is None:
        raise HTTPException(403, "Este PIN não pode finalizar este atendimento.")
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


@app.post("/api/queue/finish")
def api_finish(payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN inválido")
    item = db.checkout_by_attendant(attendant["id"])
    if item is None:
        raise HTTPException(409, "Você não possui atendimento em andamento")
    return {
        "data": {
            "cod_evento": item["cod_evento"],
            "status": "concluido",
            "pet": item["nom_animal"],
            "attendant": attendant["nome"],
        }
    }


@app.post("/api/queue/{cod_evento}/checkout")
def api_checkout(cod_evento: int, payload: PinAction):
    attendant = auth.authenticate_attendant(payload.pin)
    if not attendant:
        raise HTTPException(401, "PIN inválido")
    item = db.checkout_evento(cod_evento, attendant["id"])
    if item is None:
        raise HTTPException(409, "Atendimento não está em atendimento para este atendente")
    return {"data": {"cod_evento": cod_evento, "status": "concluido", "attendant": attendant["nome"]}}


@app.post("/api/sync")
def api_sync():
    try:
        result = sync.sync_queue()
        return {"data": result}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"Falha ao sincronizar com VetSoft: {exc}")


@app.get("/api/audit")
def api_audit(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    detalhado: bool = False,
    cod_atendente: int | None = None,
):
    if detalhado:
        return {"data": db.get_audit_detalhado(dat_inicio, dat_fim, cod_atendente)}
    return {"data": db.get_audit(dat_inicio, dat_fim, cod_atendente)}


# ----------------------------------------------------------------------
# Ferramentas / Debug (protegidas por PIN admin)
# ----------------------------------------------------------------------
@app.get("/api/debug/status", dependencies=[Depends(require_admin)])
def api_debug_status():
    return {"data": db.count_all()}


@app.post("/api/debug/clear-queue", dependencies=[Depends(require_admin)])
def api_debug_clear_queue():
    cleared = db.clear_queue()
    synced = sync.sync_queue()
    return {"data": {"limpos": cleared, "sync": synced, "status": db.count_queue()}}


@app.post("/api/debug/clear-audit", dependencies=[Depends(require_admin)])
def api_debug_clear_audit():
    return {"data": {"limpos": db.clear_attendances()}}


@app.post("/api/debug/clear-all", dependencies=[Depends(require_admin)])
def api_debug_clear_all():
    q = db.clear_queue()
    a = db.clear_attendances()
    synced = sync.sync_queue()
    return {"data": {"fila_limpa": q, "auditoria_limpa": a, "sync": synced, "status": db.count_all()}}


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")