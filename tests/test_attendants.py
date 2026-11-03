"""Listagem de atendentes: contagens de atendimentos e filtro de inativos."""
import config
import db


def _attendance(attendant_id, cod_evento, finished_at):
    conn = db.get_conn()
    conn.execute(
        """
        INSERT INTO attendances
            (cod_evento, attendant_id, nom_attendant, nom_cliente, nom_animal,
             services, claimed_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            cod_evento,
            attendant_id,
            "Ana",
            f"Tutor {cod_evento}",
            f"PET{cod_evento}",
            "[]",
            finished_at,
            finished_at,
        ),
    )
    conn.commit()


def test_attendants_stats_total_e_mes(client, login_as, make_attendant):
    ana = make_attendant("Ana", "1111")
    bia = make_attendant("Bia", "2222")
    db.set_attendant_ativo(bia["id"], False)

    month_start = f"{config.business_today()[:7]}-01"
    _attendance(ana["id"], 1, f"{month_start} 10:00:00")  # este mês
    _attendance(ana["id"], 2, "2020-01-01 10:00:00")     # antigo
    _attendance(bia["id"], 3, f"{month_start} 11:00:00")  # este mês

    login_as(client, "admin")

    ativos = client.get("/api/attendants").json()["data"]
    nomes = {a["nome"]: a for a in ativos}
    assert set(nomes) == {"Ana"}
    assert nomes["Ana"]["total_atendimentos"] == 2
    assert nomes["Ana"]["atendimentos_mes"] == 1

    todos = client.get("/api/attendants?incluir_inativos=true").json()["data"]
    nomes = {a["nome"]: a for a in todos}
    assert set(nomes) == {"Ana", "Bia"}
    assert nomes["Bia"]["ativo"] == 0
    assert nomes["Bia"]["total_atendimentos"] == 1
    assert nomes["Bia"]["atendimentos_mes"] == 1
