import threading

import config
import db
import vetsoft_client
from vetsoft_client import VetSoftClient, VetSoftError

_local = threading.local()
_sync_lock = threading.Lock()


def get_client() -> VetSoftClient:
    client = getattr(_local, "client", None)
    if client is None:
        client = VetSoftClient()
        client.login()
        _local.client = client
    return client


def sync_queue() -> dict:
    """Serializa as sincronizações (loop de fundo + botão manual + debug)."""
    with _sync_lock:
        return _sync_queue_locked()


def _sync_queue_locked() -> dict:
    """Busca agendamentos de estética de hoje no VetSoft e sincroniza a fila local."""
    client = get_client()
    today = config.business_today()
    eventos = client.list_estetica(
        dat_inicial=today,
        dat_final=today,
        incluir_cancelados=True,
        per_page=100,
    )

    presentes = set()
    try:
        for ev in eventos:
            presentes.add(ev["cod_evento"])
            db.upsert_evento(ev, commit=False)
        db.get_conn().commit()
    except Exception:
        db.get_conn().rollback()
        raise

    if not db.cache_is_fresh(3600):
        catalog = {s["cod_prod_serv"]: s for s in client.list_services()}
        catalog.update({s["cod_prod_serv"]: s for s in client.list_estetica_services()})
        db.cache_services(list(catalog.values()))

    _cache_missing_animals(client, eventos)

    removidos = db.mark_removed_today_missing(presentes, today)
    velhos_removidos = db.purge_old_days(today)
    cancelados = sum(1 for ev in eventos if ev.get("cod_situacao_atual") == 3)
    return {
        "total": len(eventos),              # tudo que a VetSoft devolveu hoje
        "ativos": len(eventos) - cancelados,  # não cancelados (entram/atualizam a base)
        "cancelados_vetsoft": cancelados,   # já cancelados na origem (não entram na fila)
        "removidos": removidos,
        "velhos_removidos": velhos_removidos,
        "fila": db.count_queue(today),      # snapshot do que está na base hoje
    }


def _cache_missing_animals(client: VetSoftClient, eventos: list[dict]) -> None:
    """Busca (sob demanda) número de identificação e observações dos animais da fila de hoje."""
    ids = {ev.get("cod_animal") for ev in eventos if ev.get("cod_animal")}
    missing = (ids - db.get_cached_animal_ids()) | db.get_animals_missing_obs()
    if not missing:
        return
    found = []
    for cod_animal in sorted(missing):
        try:
            found.append(client.get_animal(cod_animal))
        except VetSoftError:
            continue
    if found:
        db.cache_animals(found)


def sync_loop(stop_event: threading.Event, interval: int) -> None:
    while not stop_event.is_set():
        try:
            r = sync_queue()
            f = r.get("fila", {})
            print(
                f"[sync] VetSoft: {r['total']} retornados "
                f"({r['ativos']} ativos + {r['cancelados_vetsoft']} cancelados na origem) "
                f"| base hoje: {f.get('aguardando', 0)} aguardando, {f.get('presente', 0)} presente, "
                f"{f.get('em_atendimento', 0)} em atendimento, {f.get('concluido', 0)} concluído, "
                f"{f.get('cancelado', 0)} cancelado "
                f"| removidos={r['removidos']} velhos_removidos={r['velhos_removidos']}",
                flush=True,
            )
        except (VetSoftError, Exception) as exc:  # noqa: BLE001
            print(f"[sync] erro: {exc}", flush=True)
        stop_event.wait(interval)