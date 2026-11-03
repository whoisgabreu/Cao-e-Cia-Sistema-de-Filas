"""Hub de eventos da fila (SSE) — sem Redis.

Um hub por processo. A tarefa `run()` lê uma assinatura leve do banco
compartilhado a cada ~1s e publica "changed" para os assinantes quando muda.
Funciona com qualquer nº de workers (todos leem o mesmo SQLite).
"""
import asyncio

import db


class QueueHub:
    def __init__(self) -> None:
        self._subs: set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._subs.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.discard(q)

    def publish(self, msg: dict) -> None:
        for q in list(self._subs):
            try:
                q.put_nowait(msg)
            except asyncio.QueueFull:
                pass

    async def run(self, interval: float = 1.0) -> None:
        last = None
        while True:
            # Sem assinantes não há o que detectar: economiza idas ao banco.
            if self._subs:
                try:
                    sig = await asyncio.to_thread(db.queue_signature)
                    if sig != last:
                        last = sig
                        self.publish({"type": "changed"})
                except Exception:  # noqa: BLE001
                    pass
            await asyncio.sleep(interval)


hub = QueueHub()