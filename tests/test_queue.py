"""Fila: pegar próximo (ordem/prioridade), finalizar, prioridade, limpeza e contagem."""
from datetime import date, timedelta

import config
import db


def _hoje():
    return config.business_today()


def _ontem():
    return (date.fromisoformat(_hoje()) - timedelta(days=1)).isoformat()


def _q(cod_evento):
    return db.get_conn().execute(
        "SELECT * FROM queue_items WHERE cod_evento = ?", (cod_evento,)
    ).fetchone()


def test_start_next_pega_o_mais_antigo(client, login_as, make_attendant, add_queue_item):
    att = make_attendant("Ana", "1111")
    add_queue_item(1, checked_in=f"{_hoje()} 10:00:00")
    add_queue_item(2, checked_in=f"{_hoje()} 09:00:00")
    login_as(client, "atendente")

    r = client.post("/api/queue/next", json={"pin": "1111"})
    assert r.status_code == 200, r.text
    assert r.json()["data"]["pet"] == "PET2"  # chegou antes (09:00)
    assert _q(2)["claimed_by"] == att["id"]


def test_prioridade_passa_para_frente(client, login_as, make_attendant, add_queue_item):
    make_attendant("Ana", "1111")
    add_queue_item(1, checked_in=f"{_hoje()} 08:00:00")
    add_queue_item(2, checked_in=f"{_hoje()} 09:00:00")
    # marca PET2 (chegou depois) como prioritário → deve vir primeiro
    assert db.set_prioridade(2, True) == "ok"
    login_as(client, "atendente")
    r = client.post("/api/queue/next", json={"pin": "1111"})
    assert r.status_code == 200
    assert r.json()["data"]["pet"] == "PET2"


def test_prioridade_so_para_pendentes_de_hoje(make_attendant, add_queue_item):
    make_attendant("Ana", "1111")
    add_queue_item(1, status="concluido")
    assert db.set_prioridade(1, True) == "nao_disponivel"
    # item de outro dia → não encontrado (fora do dia)
    add_queue_item(2, status="presente", data=_ontem(), checked_in=f"{_ontem()} 09:00:00")
    assert db.set_prioridade(2, True) == "nao_encontrado"


def test_checkout_limpa_prioridade(client, login_as, make_attendant, add_queue_item):
    make_attendant("Ana", "1111")
    add_queue_item(1, checked_in=f"{_hoje()} 09:00:00")
    assert db.set_prioridade(1, True) == "ok"
    assert _q(1)["is_prioridade"] == 1
    login_as(client, "atendente")
    assert client.post("/api/queue/next", json={"pin": "1111"}).status_code == 200
    assert client.post("/api/queue/finish", json={"pin": "1111"}).status_code == 200
    assert _q(1)["is_prioridade"] == 0


def test_get_queue_so_do_dia(add_queue_item):
    hoje = _hoje()
    add_queue_item(1, checked_in=f"{hoje} 09:00:00")
    add_queue_item(2, data=_ontem(), checked_in=f"{_ontem()} 09:00:00")
    eventos = {i["cod_evento"] for i in db.get_queue()}
    assert 1 in eventos
    assert 2 not in eventos


def test_count_queue_so_do_dia(add_queue_item):
    hoje = _hoje()
    add_queue_item(1, status="aguardando")
    add_queue_item(2, status="presente")
    add_queue_item(3, status="presente", data=_ontem(), checked_in=f"{_ontem()} 09:00:00")
    counts = db.count_queue()
    assert counts["total"] == 2
    assert counts["aguardando"] == 1
    assert counts["presente"] == 1


def test_purge_old_days_mantem_em_andamento(add_queue_item):
    ontem = _ontem()
    add_queue_item(1, status="aguardando", data=ontem, checked_in=f"{ontem} 09:00:00")
    add_queue_item(2, status="concluido", data=ontem, checked_in=f"{ontem} 09:00:00")
    add_queue_item(3, status="em_atendimento", data=ontem, checked_in=f"{ontem} 09:00:00")
    add_queue_item(4, status="presente", checked_in=f"{_hoje()} 09:00:00")

    removidos = db.purge_old_days()
    assert removidos == 2  # aguardando + concluido de ontem
    assert _q(1) is None
    assert _q(2) is None
    assert _q(3) is not None  # em_atendimento preservado
    assert _q(4) is not None  # hoje preservado


def test_finish_pin_de_outro_atendente_nao_finaliza(client, login_as, make_attendant, add_queue_item):
    make_attendant("Ana", "1111")
    make_attendant("Bia", "2222")
    add_queue_item(1, checked_in=f"{_hoje()} 09:00:00")
    login_as(client, "atendente")
    assert client.post("/api/queue/next", json={"pin": "1111"}).status_code == 200
    # Bia tenta finalizar o pet da Ana
    r = client.post("/api/queue/finish", json={"pin": "2222"})
    assert r.status_code == 409