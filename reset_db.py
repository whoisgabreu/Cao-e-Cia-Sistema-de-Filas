"""Comandos de debug para limpar o banco local da fila.

Uso:
    python reset_db.py --queue        limpa a fila e re-sincroniza com o VetSoft
    python reset_db.py --audit        limpa os registros de auditoria
    python reset_db.py --attendants   limpa os atendentes
    python reset_db.py --all          limpa fila + auditoria + atendentes

Por padrão pede confirmação. Use --force para pular.
"""
import argparse
import sys

import config
import db


def confirm() -> bool:
    try:
        return input("Confirmar? [s/N] ").strip().lower() in ("s", "sim", "y", "yes")
    except (EOFError, KeyboardInterrupt):
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Limpa o banco local da fila de banho e tosa.")
    parser.add_argument("--queue", action="store_true", help="limpa a fila e re-sincroniza")
    parser.add_argument("--audit", action="store_true", help="limpa a auditoria")
    parser.add_argument("--attendants", action="store_true", help="limpa os atendentes")
    parser.add_argument("--all", action="store_true", help="limpa tudo (fila + auditoria + atendentes)")
    parser.add_argument("--force", action="store_true", help="não pede confirmação")
    args = parser.parse_args()

    if not any([args.queue, args.audit, args.attendants, args.all]):
        parser.print_help()
        sys.exit(1)

    db.init_db()
    print(f"Banco: {config.DB_PATH}")
    print("Estado atual:", db.count_all())

    targets = []
    if args.all:
        targets = ["queue", "audit", "attendants"]
    else:
        if args.queue:
            targets.append("queue")
        if args.audit:
            targets.append("audit")
        if args.attendants:
            targets.append("attendants")

    if not args.force:
        print(f"Serão limpos: {', '.join(targets)}")
        if not confirm():
            print("Abortado.")
            sys.exit(0)

    for target in targets:
        if target == "queue":
            n = db.clear_queue()
            print(f"Fila limpa: {n} registro(s) removidos")
            import sync
            print("Re-sincronizando com o VetSoft...")
            try:
                result = sync.sync_queue()
                print(f"Sync: {result}")
            except Exception as exc:  # noqa: BLE001
                print(f"Falha na sincronização: {exc}", file=sys.stderr)
        elif target == "audit":
            n = db.clear_attendances()
            print(f"Auditoria limpa: {n} registro(s) removidos")
        elif target == "attendants":
            try:
                n = db.clear_attendants()
            except RuntimeError as exc:
                print(f"Não foi possível limpar atendentes: {exc}", file=sys.stderr)
                continue
            print(f"Atendentes limpos: {n} registro(s) removidos")

    print("Estado final:", db.count_all())


if __name__ == "__main__":
    main()