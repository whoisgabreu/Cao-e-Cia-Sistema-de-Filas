"""SSE: endpoint exige sessão."""


def test_stream_sem_sessao_401(client):
    r = client.get("/api/queue/stream")
    assert r.status_code == 401
