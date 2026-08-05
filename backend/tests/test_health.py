def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_openapi_is_served(client):
    """Phase 0 완료 기준: /docs Swagger 노출."""
    assert client.get("/openapi.json").status_code == 200
