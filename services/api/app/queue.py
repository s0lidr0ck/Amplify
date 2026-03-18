"""Job queue - Redis/ARQ for worker tasks."""

import logging

from arq import create_pool
from arq.connections import RedisSettings

from app.config import settings

logger = logging.getLogger(__name__)

_redis_pool = None


async def get_queue():
    """Get the ARQ Redis pool for enqueueing jobs."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _redis_pool


async def close_queue():
    """Close the Redis pool (on app shutdown)."""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.close()
        _redis_pool = None
        logger.info("Queue pool closed")
