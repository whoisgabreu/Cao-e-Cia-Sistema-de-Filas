"""Diagnóstico rápido da API VetSoft (login, refresh e agenda de estética de hoje)."""
from datetime import date

from vetsoft_client import VetSoftClient


def main() -> None:
    client = VetSoftClient()

    login = client.login()
    print(f"Login OK — expires_in={login.get('expires_in')}s")

    refreshed = client.refresh()
    print(f"Refresh OK — expires_in={refreshed.get('expires_in')}s")

    today = date.today().isoformat()
    eventos = client.list_estetica(dat_inicial=today, dat_final=today, incluir_cancelados=True)
    print(f"Estética hoje ({today}): {len(eventos)} evento(s)")
    for ev in eventos:
        print(
            f"  #{ev['cod_evento']} {ev.get('dat_evento')} | "
            f"{ev.get('nom_cliente')} / {ev.get('nom_animal')} | "
            f"situação={ev.get('cod_situacao_atual')}"
        )


if __name__ == "__main__":
    main()