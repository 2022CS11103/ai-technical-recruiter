import pytest
from httpx import ASGITransport, AsyncClient

# API integration tests require DATABASE_URL; skip gracefully if unavailable.


@pytest.mark.asyncio
async def test_health_endpoint_importable():
    try:
        from app.main import app
    except Exception as exc:
        pytest.skip(f"API app not importable in this environment: {exc}")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/health")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
