"""Amplify worker entrypoint."""

from arq import create_pool
from arq.connections import RedisSettings

from worker.config import settings
from worker.tasks.transcribe_arq import transcribe_sermon as transcribe_sermon_task
from worker.tasks.trim import trim_sermon
from worker.tasks.youtube_import import download_youtube_source


async def startup(ctx):
    """Worker startup."""
    ctx["redis"] = await create_pool(RedisSettings.from_dsn(settings.redis_url))


async def shutdown(ctx):
    """Worker shutdown."""
    if ctx.get("redis"):
        await ctx["redis"].close()


async def sample_task(ctx, name: str):
    """Sample task for testing."""
    return f"Hello, {name}"


class WorkerSettings:
    """ARQ worker settings."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
    functions = [sample_task, trim_sermon, transcribe_sermon_task, download_youtube_source]
    job_timeout = 1800
