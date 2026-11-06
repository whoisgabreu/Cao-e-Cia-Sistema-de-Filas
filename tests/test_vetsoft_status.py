"""Mapeamento híbrido dos status do VetSoft para o kanban local."""
import config
import db


def _ev(cod, situacao):
    return {
        "cod_evento": cod,
        "cod_situacao_atual": situacao,
        "dat_evento": f"{config.business_today()} 10:00:00",
        "nom_animal": f"PET{cod}",
        "nom_cliente": f"Tutor {cod}",
        "services": [],
    }


def _row(cod):
    return db.get_conn().execute(
        "SELECT * FROM queue_items WHERE cod_evento = ?", (cod,)
    ).fetchone()


def _count_attendances():
    return db.get_conn().execute(
        "SELECT COUNT(*) AS n FROM attendances"
    ).fetchone()["n"]


def test_status_7_avanca_aguardando_para_presente(add_queue_item):
    add_queue_item(1, status="aguardando")
    assert db.upsert_evento(_ev(1, 7)) == "presente"
    row = _row(1)
    assert row["status"] == "presente"
    assert row["checked_in_at"] is not None


def test_status_7_nao_regride_em_atendimento(add_queue_item):
    add_queue_item(1, status="em_atendimento")
    assert db.upsert_evento(_ev(1, 7)) == "em_atendimento"
    assert _row(1)["status"] == "em_atendimento"


def test_status_8_conclui_sem_auditoria(add_queue_item):
    add_queue_item(1, status="presente")
    assert db.set_prioridade(1, True) == "ok"
    assert db.upsert_evento(_ev(1, 8)) == "concluido"
    row = _row(1)
    assert row["status"] == "concluido"
    assert row["finished_at"] is not None
    assert row["is_prioridade"] == 0
    assert _count_attendances() == 0


def test_status_1_e_4_nao_regridem(add_queue_item):
    add_queue_item(1, status="presente")
    assert db.upsert_evento(_ev(1, 1)) == "presente"
    assert db.upsert_evento(_ev(1, 4)) == "presente"
    assert _row(1)["status"] == "presente"

    add_queue_item(2, status="aguardando")
    assert db.upsert_evento(_ev(2, 4)) == "aguardando"


def test_status_3_cancela(add_queue_item):
    add_queue_item(1, status="presente")
    assert db.upsert_evento(_ev(1, 3)) == "cancelado"
    row = _row(1)
    assert row["status"] == "cancelado"
    assert row["cancel_origem"] == "vetsoft"


def test_status_11_e_14_ignorados(add_queue_item):
    add_queue_item(1, status="aguardando")
    assert db.upsert_evento(_ev(1, 11)) == "aguardando"
    assert db.upsert_evento(_ev(1, 14)) == "aguardando"
    assert _row(1)["status"] == "aguardando"


def test_cancelamento_local_nao_reativa(add_queue_item):
    add_queue_item(1, status="cancelado")
    conn = db.get_conn()
    conn.execute("UPDATE queue_items SET cancel_origem='local' WHERE cod_evento=1")
    conn.commit()

    assert db.upsert_evento(_ev(1, 7)) == "cancelado"
    assert _row(1)["status"] == "cancelado"


def test_reativa_cancelado_pelo_vetsoft(add_queue_item):
    add_queue_item(1, status="cancelado")
    conn = db.get_conn()
    conn.execute("UPDATE queue_items SET cancel_origem='vetsoft' WHERE cod_evento=1")
    conn.commit()

    assert db.upsert_evento(_ev(1, 7)) == "presente"
    row = _row(1)
    assert row["status"] == "presente"
    assert row["cancel_origem"] is None


def test_novo_evento_com_status_7_e_8():
    assert db.upsert_evento(_ev(1, 7)) == "presente"
    assert _row(1)["status"] == "presente"

    assert db.upsert_evento(_ev(2, 8)) == "concluido"
    assert _row(2)["status"] == "concluido"
    assert _count_attendances() == 0
