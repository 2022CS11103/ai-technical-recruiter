import redis.asyncio as redis

from app.core.config import get_settings

_settings = get_settings()
_client: redis.Redis | None = None


async def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.from_url(_settings.redis_url, decode_responses=True)
    return _client


async def close_redis() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None
