import json
import sqlite3
import threading

import config

_local = threading.local()

# Memoização dos catálogos (invalidada a cada escrita em cache_*).
_services_names_cache: dict[int, str] | None = None
_animals_ident_cache: dict[int, dict] | None = None

STATUS_AGUARDANDO = "aguardando"
STATUS_PRESENTE = "presente"
STATUS_EM_ATENDIMENTO = "em_atendimento"
STATUS_CONCLUIDO = "concluido"
STATUS_CANCELADO = "cancelado"

ALL_STATUS = [
    STATUS_AGUARDANDO,
    STATUS_PRESENTE,
    STATUS_EM_ATENDIMENTO,
    STATUS_CONCLUIDO,
    STATUS_CANCELADO,
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS attendants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    pin_hash   TEXT NOT NULL,
    pin_salt   TEXT NOT NULL,
    ativo      INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue_items (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    cod_evento         INTEGER NOT NULL UNIQUE,
    cod_cliente        INTEGER,
    nom_cliente        TEXT,
    cod_animal         INTEGER,
    nom_animal         TEXT,
    services           TEXT,
    dat_evento         TEXT,
    dat_termino        TEXT,
    tip_transporte     TEXT,
    obs_estetica       TEXT,
    vetsoft_situacao   INTEGER,
    status             TEXT NOT NULL DEFAULT 'aguardando',
    claimed_by         INTEGER REFERENCES attendants(id),
    checked_in_at      TEXT,
    claimed_at         TEXT,
    finished_at        TEXT,
    is_prioridade      INTEGER NOT NULL DEFAULT 0,
    prioridade_at      TEXT,
    updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendances (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    cod_evento     INTEGER NOT NULL,
    attendant_id   INTEGER NOT NULL REFERENCES attendants(id),
    nom_attendant  TEXT NOT NULL,
    nom_cliente    TEXT,
    nom_animal     TEXT,
    services       TEXT,
    claimed_at     TEXT,
    finished_at    TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prod_serv_cache (
    cod_prod_serv INTEGER PRIMARY KEY,
    nom_prod_serv TEXT,
    val_venda     TEXT,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS animal_cache (
    cod_animal        INTEGER PRIMARY KEY,
    num_identificacao TEXT,
    nom_animal        TEXT,
    obs_animal        TEXT,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(config.DB_PATH, check_same_thread=False, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 5000")
        _local.conn = conn
    return conn


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    _migrate(conn)
    conn.commit()


def _migrate(conn: sqlite3.Connection) -> None:
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(attendants)").fetchall()}
    if "ativo" not in cols:
        conn.execute("ALTER TABLE attendants ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1")
    qcols = {r["name"] for r in conn.execute("PRAGMA table_info(queue_items)").fetchall()}
    if "checked_in_at" not in qcols:
        conn.execute("ALTER TABLE queue_items ADD COLUMN checked_in_at TEXT")
    if "cancelled_at" not in qcols:
        conn.execute("ALTER TABLE queue_items ADD COLUMN cancelled_at TEXT")
    if "cancel_motivo" not in qcols:
        conn.execute("ALTER TABLE queue_items ADD COLUMN cancel_motivo TEXT")
    if "cancel_origem" not in qcols:
        # 'local' (botão Cancelar), 'vetsoft' (cancelado/removido no VetSoft), 'sistema' (dia anterior)
        conn.execute("ALTER TABLE queue_items ADD COLUMN cancel_origem TEXT")
    if "is_prioridade" not in qcols:
        conn.execute("ALTER TABLE queue_items ADD COLUMN is_prioridade INTEGER NOT NULL DEFAULT 0")
    if "prioridade_at" not in qcols:
        conn.execute("ALTER TABLE queue_items ADD COLUMN prioridade_at TEXT")
    acols = {r["name"] for r in conn.execute("PRAGMA table_info(animal_cache)").fetchall()}
    if "obs_animal" not in acols:
        conn.execute("ALTER TABLE animal_cache ADD COLUMN obs_animal TEXT")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_attendances_attendant_finished "
        "ON attendances(attendant_id, finished_at)"
    )


def rows_to_list(rows) -> list[dict]:
    return [dict(r) for r in rows]


def _parse_services(services_json: str | None):
    if not services_json:
        return []
    try:
        return json.loads(services_json)
    except (ValueError, TypeError):
        return []


def _with_service_names(item: dict) -> dict:
    """Preenche nomes dos serviços de um item da fila."""
    names = get_services_names()
    services = _parse_services(item.get("services"))
    for s in services:
        cod = s.get("cod_prod_serv")
        if cod is not None:
            s["nom_prod_serv"] = names.get(cod, f"Serviço #{cod}")
    item["services"] = services
    return item


def get_queue(today: str | None = None) -> list[dict]:
    today = today or config.business_today()
    conn = get_conn()
    rows = conn.execute(
        """
        SELECT q.*, a.nome AS attendant_nome
        FROM queue_items q
        LEFT JOIN attendants a ON a.id = q.claimed_by
        WHERE substr(q.dat_evento, 1, 10) = ?
          AND q.status IN ('aguardando', 'presente', 'em_atendimento', 'concluido', 'cancelado')
        ORDER BY q.is_prioridade DESC,
                 COALESCE(q.prioridade_at, q.checked_in_at, q.dat_evento) ASC
        """,
        (today,),
    ).fetchall()
    items = rows_to_list(rows)
    names = get_services_names()
    animals = get_animals_ident()
    for it in items:
        services = _parse_services(it.pop("services"))
        for s in services:
            cod = s.get("cod_prod_serv")
            if cod is not None:
                s["nom_prod_serv"] = names.get(cod, f"Serviço #{cod}")
        it["services"] = services
        animal = animals.get(it.get("cod_animal"))
        if animal:
            it["num_identificacao"] = animal.get("num_identificacao")
            it["obs_animal"] = animal.get("obs_animal")
    return items


def queue_signature(today: str | None = None) -> tuple:
    """Assinatura leve do estado da fila de hoje (para detectar mudanças no SSE).

    Toda mutação atualiza `updated_at`; inclui contagem (novos/removidos) e
    prioridade. Não precisa instrumentar cada endpoint.
    """
    today = today or config.business_today()
    row = get_conn().execute(
        """
        SELECT COUNT(*) AS c, MAX(updated_at) AS u, MAX(prioridade_at) AS p
        FROM queue_items
        WHERE substr(dat_evento, 1, 10) = ?
        """,
        (today,),
    ).fetchone()
    return (row["c"], row["u"], row["p"])


def cache_services(services: list[dict]) -> None:
    if not services:
        return
    global _services_names_cache
    conn = get_conn()
    conn.executemany(
        """
        INSERT INTO prod_serv_cache (cod_prod_serv, nom_prod_serv, val_venda, updated_at)
        VALUES (:cod_prod_serv, :nom_prod_serv, :val_venda, datetime('now'))
        ON CONFLICT(cod_prod_serv) DO UPDATE SET
            nom_prod_serv=excluded.nom_prod_serv,
            val_venda=excluded.val_venda,
            updated_at=datetime('now')
        """,
        [
            {
                "cod_prod_serv": s.get("cod_prod_serv"),
                "nom_prod_serv": s.get("nom_prod_serv"),
                "val_venda": s.get("val_venda"),
            }
            for s in services
        ],
    )
    conn.commit()
    _services_names_cache = None


def get_services_names() -> dict[int, str]:
    global _services_names_cache
    if _services_names_cache is None:
        conn = get_conn()
        rows = conn.execute("SELECT cod_prod_serv, nom_prod_serv FROM prod_serv_cache").fetchall()
        _services_names_cache = {r["cod_prod_serv"]: r["nom_prod_serv"] for r in rows}
    return _services_names_cache


def cache_is_fresh(max_age_seconds: int, table: str = "prod_serv_cache") -> bool:
    conn = get_conn()
    row = conn.execute(f"SELECT MAX(updated_at) AS ts FROM {table}").fetchone()
    if not row or not row["ts"]:
        return False
    age = conn.execute(
        "SELECT (julianday('now') - julianday(?)) * 86400 AS age", (row["ts"],)
    ).fetchone()["age"]
    return age is not None and age < max_age_seconds


def cache_animals(animals: list[dict]) -> None:
    if not animals:
        return
    global _animals_ident_cache
    conn = get_conn()
    conn.executemany(
        """
        INSERT INTO animal_cache (cod_animal, num_identificacao, nom_animal, obs_animal, updated_at)
        VALUES (:cod_animal, :num_identificacao, :nom_animal, :obs_animal, datetime('now'))
        ON CONFLICT(cod_animal) DO UPDATE SET
            num_identificacao=excluded.num_identificacao,
            nom_animal=excluded.nom_animal,
            obs_animal=excluded.obs_animal,
            updated_at=datetime('now')
        """,
        [
            {
                "cod_animal": a.get("cod_animal"),
                "num_identificacao": a.get("num_identificacao"),
                "nom_animal": a.get("nom_animal"),
                "obs_animal": a.get("obs_animal"),
            }
            for a in animals
        ],
    )
    conn.commit()
    _animals_ident_cache = None


def get_animals_ident() -> dict[int, dict]:
    global _animals_ident_cache
    if _animals_ident_cache is None:
        conn = get_conn()
        rows = conn.execute(
            "SELECT cod_animal, num_identificacao, nom_animal, obs_animal FROM animal_cache"
        ).fetchall()
        _animals_ident_cache = {
            r["cod_animal"]: {
                "num_identificacao": r["num_identificacao"],
                "nom_animal": r["nom_animal"],
                "obs_animal": r["obs_animal"],
            }
            for r in rows
        }
    return _animals_ident_cache


def get_cached_animal_ids() -> set[int]:
    conn = get_conn()
    rows = conn.execute("SELECT cod_animal FROM animal_cache").fetchall()
    return {r["cod_animal"] for r in rows}


def get_animals_missing_obs() -> set[int]:
    """Animais em cache sem obs_animal (para popular uma única vez)."""
    conn = get_conn()
    rows = conn.execute(
        "SELECT cod_animal FROM animal_cache WHERE obs_animal IS NULL"
    ).fetchall()
    return {r["cod_animal"] for r in rows}


def upsert_evento(ev: dict, commit: bool = True) -> str:
    """Insere/atualiza um evento vindo do VetSoft. Retorna o status resultante.

    Com `commit=False`, deixa a transação aberta para o chamador agrupar escritas.
    """
    conn = get_conn()
    cod_evento = ev["cod_evento"]
    vetsoft_situacao = ev.get("cod_situacao_atual")
    dat_evento = ev.get("dat_evento")
    row = conn.execute(
        "SELECT status, cancel_origem FROM queue_items WHERE cod_evento = ?", (cod_evento,)
    ).fetchone()

    services = json.dumps(ev.get("services") or [], ensure_ascii=False)
    fields = dict(
        cod_cliente=ev.get("cod_cliente"),
        nom_cliente=ev.get("nom_cliente"),
        cod_animal=ev.get("cod_animal"),
        nom_animal=ev.get("nom_animal"),
        services=services,
        dat_evento=dat_evento,
        dat_termino=ev.get("dat_termino"),
        tip_transporte=ev.get("tip_transporte"),
        obs_estetica=ev.get("obs_estetica"),
        vetsoft_situacao=vetsoft_situacao,
    )

    is_cancelled = vetsoft_situacao == 3

    if row is None:
        if is_cancelled:
            return STATUS_CANCELADO
        status = STATUS_AGUARDANDO
        conn.execute(
            """
            INSERT INTO queue_items
                (cod_evento, cod_cliente, nom_cliente, cod_animal, nom_animal,
                 services, dat_evento, dat_termino, tip_transporte, obs_estetica,
                 vetsoft_situacao, status, updated_at)
            VALUES
                (:cod_evento, :cod_cliente, :nom_cliente, :cod_animal, :nom_animal,
                 :services, :dat_evento, :dat_termino, :tip_transporte, :obs_estetica,
                 :vetsoft_situacao, :status, datetime('now'))
            """,
            {**fields, "cod_evento": cod_evento, "status": status},
        )
        if commit:
            conn.commit()
        return status

    status = row["status"]
    origem = row["cancel_origem"]
    cancel_sql = ""
    if status == STATUS_CANCELADO and not is_cancelled and origem != "local":
        # VetSoft reativou (ou o evento voltou para a agenda): volta para a fila
        status = STATUS_AGUARDANDO
        cancel_sql = ", cancelled_at=NULL, cancel_motivo=NULL, cancel_origem=NULL"
    if is_cancelled and status not in (STATUS_CONCLUIDO, STATUS_CANCELADO):
        status = STATUS_CANCELADO
        cancel_sql = ", cancelled_at=datetime('now'), cancel_origem='vetsoft'"

    conn.execute(
        f"""
        UPDATE queue_items
        SET cod_cliente=:cod_cliente, nom_cliente=:nom_cliente, cod_animal=:cod_animal,
            nom_animal=:nom_animal, services=:services, dat_evento=:dat_evento,
            dat_termino=:dat_termino, tip_transporte=:tip_transporte, obs_estetica=:obs_estetica,
            vetsoft_situacao=:vetsoft_situacao, status=:status, updated_at=datetime('now'){cancel_sql}
        WHERE cod_evento = :cod_evento
        """,
        {**fields, "cod_evento": cod_evento, "status": status},
    )
    if commit:
        conn.commit()
    return status


def mark_removed(cod_evento: int) -> None:
    conn = get_conn()
    conn.execute(
        """
        UPDATE queue_items
        SET status='cancelado', vetsoft_situacao=3, updated_at=datetime('now'),
            cancelled_at=datetime('now'), cancel_origem='vetsoft'
        WHERE cod_evento = ? AND status NOT IN ('concluido', 'cancelado')
        """,
        (cod_evento,),
    )
    conn.commit()


def mark_removed_today_missing(presentes: set[int], data: str) -> int:
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='cancelado', vetsoft_situacao=3, updated_at=datetime('now'),
            cancelled_at=datetime('now'), cancel_origem='vetsoft'
        WHERE substr(dat_evento, 1, 10) = ?
          AND cod_evento NOT IN ({})
          AND status NOT IN ('concluido', 'cancelado')
        """.format(",".join("?" * len(presentes)) or "NULL"),
        [data, *presentes],
    )
    conn.commit()
    return cur.rowcount


def purge_old_days(today: str | None = None) -> int:
    """Remove da fila os registros de dias anteriores (histórico fica em attendances).

    Preserva `em_atendimento` (serviço em andamento na virada do dia).
    """
    today = today or config.business_today()
    conn = get_conn()
    cur = conn.execute(
        """
        DELETE FROM queue_items
        WHERE (dat_evento IS NULL OR substr(dat_evento, 1, 10) < ?)
          AND status <> 'em_atendimento'
        """,
        (today,),
    )
    conn.commit()
    return cur.rowcount


def cancel_evento(cod_evento: int, motivo: str | None = None) -> str:
    """Cancela localmente (aguardando/presente/em_atendimento -> cancelado).

    Retorna "ok", "ja_finalizado", "ja_cancelado" ou "nao_encontrado".
    """
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='cancelado', cancelled_at=datetime('now'), cancel_motivo=?,
            cancel_origem='local', updated_at=datetime('now')
        WHERE cod_evento = ? AND status IN ('aguardando', 'presente', 'em_atendimento')
        """,
        (motivo or None, cod_evento),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    row = conn.execute("SELECT status FROM queue_items WHERE cod_evento = ?", (cod_evento,)).fetchone()
    if row is None:
        return "nao_encontrado"
    return "ja_cancelado" if row["status"] == STATUS_CANCELADO else "ja_finalizado"


def set_prioridade(cod_evento: int, ativo: bool, today: str | None = None) -> str:
    """Marca/desmarca prioridade (só para pets aguardando/presente de hoje).

    Retorna "ok", "nao_encontrado" ou "nao_disponivel".
    """
    today = today or config.business_today()
    conn = get_conn()
    row = conn.execute(
        """
        SELECT status FROM queue_items
        WHERE cod_evento = ? AND substr(dat_evento, 1, 10) = ?
        """,
        (cod_evento, today),
    ).fetchone()
    if row is None:
        return "nao_encontrado"
    if row["status"] not in (STATUS_AGUARDANDO, STATUS_PRESENTE):
        return "nao_disponivel"
    if ativo:
        conn.execute(
            """
            UPDATE queue_items
            SET is_prioridade = 1,
                prioridade_at = COALESCE(prioridade_at, datetime('now')),
                updated_at = datetime('now')
            WHERE cod_evento = ?
            """,
            (cod_evento,),
        )
    else:
        conn.execute(
            """
            UPDATE queue_items
            SET is_prioridade = 0, prioridade_at = NULL, updated_at = datetime('now')
            WHERE cod_evento = ?
            """,
            (cod_evento,),
        )
    conn.commit()
    return "ok"


def restore_evento(cod_evento: int) -> str:
    """Desfaz um cancelamento feito aqui (cancelado -> aguardando).

    Retorna "ok", "vetsoft" (cancelado no VetSoft; não dá para restaurar daqui) ou "nao_disponivel".
    """
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='aguardando', claimed_by=NULL, claimed_at=NULL, checked_in_at=NULL,
            cancelled_at=NULL, cancel_motivo=NULL, cancel_origem=NULL, updated_at=datetime('now')
        WHERE cod_evento = ? AND status = 'cancelado' AND cancel_origem = 'local'
        """,
        (cod_evento,),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    row = conn.execute(
        "SELECT status, cancel_origem FROM queue_items WHERE cod_evento = ?", (cod_evento,)
    ).fetchone()
    if row and row["status"] == STATUS_CANCELADO:
        return "vetsoft"
    return "nao_disponivel"


def checkin_evento(cod_evento: int) -> str:
    """Marca o pet como presente (chegou ao salão). aguardando -> presente."""
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='presente', checked_in_at=datetime('now'), updated_at=datetime('now')
        WHERE cod_evento = ? AND status = 'aguardando'
        """,
        (cod_evento,),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    row = conn.execute("SELECT status FROM queue_items WHERE cod_evento = ?", (cod_evento,)).fetchone()
    if row and row["status"] == STATUS_PRESENTE:
        return "ja_presente"
    return "nao_disponivel"


def claim_evento(cod_evento: int, attendant_id: int) -> str:
    """Atribui um pet JÁ PRESENTE ao atendente (regra 1:1).

    Retorna "ok", "ja_em_atendimento" ou "nao_presente".
    """
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='em_atendimento', claimed_by=?, claimed_at=datetime('now'),
            updated_at=datetime('now')
        WHERE cod_evento = ? AND status = 'presente'
          AND NOT EXISTS (
              SELECT 1 FROM queue_items
              WHERE claimed_by = ? AND status = 'em_atendimento'
          )
        """,
        (attendant_id, cod_evento, attendant_id),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    if conn.execute(
        "SELECT 1 FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
        (attendant_id,),
    ).fetchone():
        return "ja_em_atendimento"
    return "nao_presente"


def start_evento(cod_evento: int, attendant_id: int) -> str:
    """Inicia o atendimento de um pet JÁ PRESENTE (regra 1:1).

    Usado pela tela do atendente: presente -> em_atendimento.
    Retorna "ok", "ja_em_atendimento" ou "nao_disponivel".
    """
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='em_atendimento', claimed_by=?, claimed_at=datetime('now'),
            checked_in_at=CASE WHEN checked_in_at IS NULL THEN datetime('now') ELSE checked_in_at END,
            updated_at=datetime('now')
        WHERE cod_evento = ? AND status = 'presente'
          AND NOT EXISTS (
              SELECT 1 FROM queue_items
              WHERE claimed_by = ? AND status = 'em_atendimento'
          )
        """,
        (attendant_id, cod_evento, attendant_id),
    )
    conn.commit()
    if cur.rowcount == 1:
        return "ok"
    if conn.execute(
        "SELECT 1 FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
        (attendant_id,),
    ).fetchone():
        return "ja_em_atendimento"
    return "nao_disponivel"


def start_next_evento(attendant_id: int) -> tuple | str:
    """Pega o próximo pet JÁ PRESENTE da fila, de forma atômica (regra 1:1).

    Retorna ("ok", item) | "ja_em_atendimento" | "fila_vazia".
    """
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='em_atendimento', claimed_by=?, claimed_at=datetime('now'),
            checked_in_at=CASE WHEN checked_in_at IS NULL THEN datetime('now') ELSE checked_in_at END,
            updated_at=datetime('now')
        WHERE cod_evento = (
            SELECT cod_evento FROM queue_items
            WHERE status = 'presente'
            ORDER BY is_prioridade DESC,
                     COALESCE(prioridade_at, checked_in_at, dat_evento) ASC
            LIMIT 1
        )
        AND NOT EXISTS (
            SELECT 1 FROM queue_items
            WHERE claimed_by = ? AND status = 'em_atendimento'
        )
        """,
        (attendant_id, attendant_id),
    )
    conn.commit()
    if cur.rowcount == 1:
        row = conn.execute(
            "SELECT * FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
            (attendant_id,),
        ).fetchone()
        return ("ok", _with_service_names(dict(row)))
    if conn.execute(
        "SELECT 1 FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
        (attendant_id,),
    ).fetchone():
        return "ja_em_atendimento"
    return "fila_vazia"


def finish_prepare(attendant_id: int) -> dict | None:
    """Retorna o resumo do atendimento ativo do atendente, sem finalizar."""
    conn = get_conn()
    row = conn.execute(
        """
        SELECT cod_evento, nom_animal, nom_cliente, services, claimed_at,
               ROUND((julianday('now') - julianday(claimed_at)) * 24 * 60, 1) AS duracao_min
        FROM queue_items
        WHERE claimed_by = ? AND status = 'em_atendimento'
        """,
        (attendant_id,),
    ).fetchone()
    if row is None:
        return None
    return _with_service_names(dict(row))


def checkout_by_attendant(attendant_id: int) -> dict | None:
    """Finaliza o atendimento em andamento do atendente (só um por vez)."""
    conn = get_conn()
    row = conn.execute(
        "SELECT cod_evento FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
        (attendant_id,),
    ).fetchone()
    if row is None:
        return None
    return checkout_evento(row["cod_evento"], attendant_id)


def checkout_evento(cod_evento: int, attendant_id: int) -> dict | None:
    conn = get_conn()
    cur = conn.execute(
        """
        UPDATE queue_items
        SET status='concluido', finished_at=datetime('now'),
            is_prioridade=0, prioridade_at=NULL, updated_at=datetime('now')
        WHERE cod_evento = ? AND status = 'em_atendimento' AND claimed_by = ?
        """,
        (cod_evento, attendant_id),
    )
    if cur.rowcount != 1:
        return None
    row = conn.execute(
        "SELECT * FROM queue_items WHERE cod_evento = ?", (cod_evento,)
    ).fetchone()
    attendant = conn.execute(
        "SELECT nome FROM attendants WHERE id = ?", (attendant_id,)
    ).fetchone()
    conn.execute(
        """
        INSERT INTO attendances
            (cod_evento, attendant_id, nom_attendant, nom_cliente, nom_animal,
             services, claimed_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            cod_evento,
            attendant_id,
            attendant["nome"] if attendant else "",
            row["nom_cliente"],
            row["nom_animal"],
            row["services"],
            row["claimed_at"],
        ),
    )
    conn.commit()
    return dict(row) if row else None


# ----------------------------------------------------------------------
# Atendentes
# ----------------------------------------------------------------------
def create_attendant(nome: str, pin_hash: str, pin_salt: str) -> dict:
    conn = get_conn()
    cur = conn.execute(
        "INSERT INTO attendants (nome, pin_hash, pin_salt) VALUES (?, ?, ?)",
        (nome, pin_hash, pin_salt),
    )
    conn.commit()
    return {"id": cur.lastrowid, "nome": nome}


def get_attendants(incluir_inativos: bool = False, month_start: str | None = None) -> list[dict]:
    today = config.business_today()
    month_start = month_start or f"{today[:7]}-01"
    conn = get_conn()
    clause = "" if incluir_inativos else "WHERE a.ativo = 1"
    rows = conn.execute(
        f"""
        SELECT a.id, a.nome, a.ativo, a.created_at,
               COUNT(t.id) AS total_atendimentos,
               COALESCE(SUM(CASE WHEN t.finished_at >= ? THEN 1 ELSE 0 END), 0)
                   AS atendimentos_mes
        FROM attendants a
        LEFT JOIN attendances t ON t.attendant_id = a.id
        {clause}
        GROUP BY a.id, a.nome, a.ativo, a.created_at
        ORDER BY a.ativo DESC, a.nome
        """,
        (f"{month_start} 00:00:00",),
    ).fetchall()
    return rows_to_list(rows)


def get_attendants_full(incluir_inativos: bool = False) -> list[dict]:
    """Atendentes com hash/salt do PIN em uma única consulta (para autenticação)."""
    conn = get_conn()
    clause = "" if incluir_inativos else "WHERE ativo = 1"
    rows = conn.execute(
        f"SELECT id, nome, ativo, pin_hash, pin_salt FROM attendants {clause} ORDER BY ativo DESC, nome"
    ).fetchall()
    return rows_to_list(rows)


def get_attendant(id: int) -> dict | None:
    conn = get_conn()
    row = conn.execute("SELECT * FROM attendants WHERE id = ?", (id,)).fetchone()
    return dict(row) if row else None


def update_attendant(
    id: int,
    nome: str | None = None,
    pin_hash: str | None = None,
    pin_salt: str | None = None,
) -> dict | None:
    sets, params = [], []
    if nome is not None:
        sets.append("nome = ?")
        params.append(nome)
    if pin_hash is not None:
        sets.append("pin_hash = ?")
        params.append(pin_hash)
        sets.append("pin_salt = ?")
        params.append(pin_salt)
    if not sets:
        return get_attendant(id)
    params.append(id)
    conn = get_conn()
    conn.execute(f"UPDATE attendants SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    return get_attendant(id)


def set_attendant_ativo(id: int, ativo: bool) -> dict | None:
    conn = get_conn()
    conn.execute("UPDATE attendants SET ativo = ? WHERE id = ?", (1 if ativo else 0, id))
    conn.commit()
    return get_attendant(id)


def count_em_atendimento(attendant_id: int) -> int:
    conn = get_conn()
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM queue_items WHERE claimed_by = ? AND status = 'em_atendimento'",
        (attendant_id,),
    ).fetchone()
    return row["n"]


# ----------------------------------------------------------------------
# Debug / Reset
# ----------------------------------------------------------------------
def count_queue(today: str | None = None) -> dict:
    today = today or config.business_today()
    conn = get_conn()
    rows = conn.execute(
        "SELECT status, COUNT(*) AS n FROM queue_items WHERE substr(dat_evento, 1, 10) = ? GROUP BY status",
        (today,),
    ).fetchall()
    counts = {s: 0 for s in ALL_STATUS}
    for r in rows:
        counts[r["status"]] = r["n"]
    counts["total"] = sum(counts.values())
    return counts


def count_all() -> dict:
    conn = get_conn()
    return {
        "queue": count_queue(),
        "attendances": conn.execute("SELECT COUNT(*) AS n FROM attendances").fetchone()["n"],
        "attendants": conn.execute("SELECT COUNT(*) AS n FROM attendants").fetchone()["n"],
    }


def clear_queue() -> int:
    conn = get_conn()
    cur = conn.execute("DELETE FROM queue_items")
    conn.commit()
    return cur.rowcount


def clear_attendances() -> int:
    conn = get_conn()
    cur = conn.execute("DELETE FROM attendances")
    conn.commit()
    return cur.rowcount


def clear_attendants() -> int:
    conn = get_conn()
    refs = conn.execute(
        """
        SELECT
            (SELECT COUNT(*) FROM attendances) AS atendimentos,
            (SELECT COUNT(*) FROM queue_items WHERE claimed_by IS NOT NULL) AS fila
        """
    ).fetchone()
    if refs["atendimentos"] or refs["fila"]:
        raise RuntimeError(
            "Há atendimentos/fila vinculados a atendentes. "
            "Use --all ou limpe a fila e a auditoria antes."
        )
    cur = conn.execute("DELETE FROM attendants")
    conn.commit()
    return cur.rowcount


# ----------------------------------------------------------------------
# Auditoria
# ----------------------------------------------------------------------
def get_audit(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    cod_atendente: int | None = None,
) -> list[dict]:
    conn = get_conn()
    where, params = [], []
    if dat_inicio:
        where.append("a.finished_at >= ?")
        params.append(f"{dat_inicio} 00:00:00")
    if dat_fim:
        where.append("a.finished_at <= ?")
        params.append(f"{dat_fim} 23:59:59")
    if cod_atendente is not None:
        where.append("a.attendant_id = ?")
        params.append(cod_atendente)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    rows = conn.execute(
        f"""
        SELECT a.attendant_id, a.nom_attendant,
               COUNT(*) AS total,
               ROUND(AVG((julianday(a.finished_at) - julianday(a.claimed_at)) * 24 * 60), 1) AS tempo_medio_min
        FROM attendances a
        {clause}
        GROUP BY a.attendant_id, a.nom_attendant
        ORDER BY total DESC
        """,
        params,
    ).fetchall()
    return rows_to_list(rows)


def get_audit_serie(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    cod_atendente: int | None = None,
) -> list[dict]:
    """Total de banhos finalizados por dia (para o gráfico do período)."""
    conn = get_conn()
    where, params = [], []
    if dat_inicio:
        where.append("a.finished_at >= ?")
        params.append(f"{dat_inicio} 00:00:00")
    if dat_fim:
        where.append("a.finished_at <= ?")
        params.append(f"{dat_fim} 23:59:59")
    if cod_atendente is not None:
        where.append("a.attendant_id = ?")
        params.append(cod_atendente)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    rows = conn.execute(
        f"""
        SELECT substr(a.finished_at, 1, 10) AS data,
               COUNT(*) AS total,
               ROUND(AVG((julianday(a.finished_at) - julianday(a.claimed_at)) * 24 * 60), 1)
                   AS tempo_medio_min
        FROM attendances a
        {clause}
        GROUP BY substr(a.finished_at, 1, 10)
        ORDER BY data
        """,
        params,
    ).fetchall()
    return rows_to_list(rows)


def get_audit_detalhado(
    dat_inicio: str | None = None,
    dat_fim: str | None = None,
    cod_atendente: int | None = None,
) -> list[dict]:
    conn = get_conn()
    where, params = [], []
    if dat_inicio:
        where.append("a.finished_at >= ?")
        params.append(f"{dat_inicio} 00:00:00")
    if dat_fim:
        where.append("a.finished_at <= ?")
        params.append(f"{dat_fim} 23:59:59")
    if cod_atendente is not None:
        where.append("a.attendant_id = ?")
        params.append(cod_atendente)
    clause = f"WHERE {' AND '.join(where)}" if where else ""

    rows = conn.execute(
        f"""
        SELECT a.id, a.cod_evento, a.nom_attendant, a.nom_cliente, a.nom_animal,
               a.services, a.claimed_at, a.finished_at,
               ROUND((julianday(a.finished_at) - julianday(a.claimed_at)) * 24 * 60, 1) AS duracao_min
        FROM attendances a
        {clause}
        ORDER BY a.finished_at DESC
        """,
        params,
    ).fetchall()
    items = rows_to_list(rows)
    names = get_services_names()
    for it in items:
        services = _parse_services(it.pop("services"))
        for s in services:
            cod = s.get("cod_prod_serv")
            if cod is not None and not s.get("nom_prod_serv"):
                s["nom_prod_serv"] = names.get(cod, f"Serviço #{cod}")
        it["services"] = services
    return items