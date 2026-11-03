import threading

import config
import db
import vetsoft_client
from vetsoft_client import VetSoftClient, VetSoftError

_local = threading.local()


def get_client() -> VetSoftClient:
    client = getattr(_local, "client", None)
    if client is None:
        client = VetSoftClient()
        client.login()
        _local.client = client
    return client


def sync_queue() -> dict:
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
    for ev in eventos:
        presentes.add(ev["cod_evento"])
        db.upsert_evento(ev)

    if not db.cache_is_fresh(3600):
        catalog = {s["cod_prod_serv"]: s for s in client.list_services()}
        catalog.update({s["cod_prod_serv"]: s for s in client.list_estetica_services()})
        db.cache_services(list(catalog.values()))

    _cache_missing_animals(client, eventos)

    removidos = db.mark_removed_today_missing(presentes, today)
    velhos_removidos = db.purge_old_days(today)
    return {"total": len(eventos), "velhos_removidos": velhos_removidos, "removidos": removidos}


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
    import config

    while not stop_event.is_set():
        try:
            result = sync_queue()
            print(f"[sync] {result}", flush=True)
        except (VetSoftError, Exception) as exc:  # noqa: BLE001
            print(f"[sync] erro: {exc}", flush=True)
        stop_event.wait(interval)