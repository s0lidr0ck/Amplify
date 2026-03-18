"""ARQ task: transcribe project media using Faster-Whisper."""

import asyncio
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from worker.config import settings
from worker.tasks.transcribe import transcribe_sermon as _transcribe_sync

# services/worker/worker/tasks -> services (same as API's media/projects routers)
_SERVICES_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _get_upload_dir() -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _SERVICES_ROOT / upload_dir
    return upload_dir


async def transcribe_sermon(ctx: dict, job_id: str):
    """
    ARQ task: transcribe project media using Faster-Whisper.
    Reads job from DB, runs transcription, calls internal API to create transcript.
    """
    api_url = settings.api_url.rstrip("/")

    async def update_job(
        status: str,
        message: str,
        error_text: str | None = None,
        progress_percent: int | None = None,
    ):
        payload: dict = {
            "status": status,
            "current_message": message,
            "error_text": error_text,
        }
        if progress_percent is not None:
            payload["progress_percent"] = progress_percent
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{api_url}/api/internal/jobs/{job_id}/update",
                json=payload,
            )

    try:
        await update_job("running", "Starting...", progress_percent=0)
    except Exception:
        pass  # Best effort

    try:
        await update_job("running", "Loading model...", progress_percent=5)
    except Exception:
        pass  # Best effort

    try:
        engine = create_async_engine(
            settings.database_url_clean(),
            connect_args=settings.database_connect_args(),
            echo=False,
        )
        async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

        async with async_session() as session:
            result = await session.execute(
                text("""
                    SELECT project_id, subject_id
                    FROM processing_jobs
                    WHERE id = :jid AND job_type = 'transcribe_sermon'
                """),
                {"jid": job_id},
            )
            row = result.fetchone()
            if not row:
                raise ValueError(f"Transcription job {job_id} not found")

            project_id, media_asset_id = row

            result = await session.execute(
                text("""
                    SELECT storage_key, filename, asset_kind
                    FROM media_assets
                    WHERE id = :aid
                """),
                {"aid": media_asset_id},
            )
            src_row = result.fetchone()
            if not src_row:
                raise ValueError(f"Media asset {media_asset_id} not found")

            storage_key, filename, asset_kind = src_row
            transcript_scope = "reel" if asset_kind == "final_reel" else "sermon"

        await engine.dispose()

        upload_dir = _get_upload_dir()
        source_path = upload_dir / storage_key / filename
        if not source_path.exists():
            raise FileNotFoundError(f"Media file not found: {source_path}")

        try:
            await update_job("running", "Transcribing...", progress_percent=10)
        except Exception:
            pass  # Best effort

        # Stream coarse progress updates while the CPU-bound transcription runs.
        loop = asyncio.get_running_loop()

        def progress_callback(progress: int, label: str):
            try:
                asyncio.run_coroutine_threadsafe(
                    update_job("running", label, progress_percent=progress),
                    loop,
                )
            except Exception:
                pass

        result = await loop.run_in_executor(
            None,
            lambda: _transcribe_sync(
                str(source_path),
                str(upload_dir),
                model_size="base",
                language="en",
                progress_callback=progress_callback,
            ),
        )

        try:
            await update_job("running", "Saving transcript...", progress_percent=90)
        except Exception:
            pass  # Best effort

        # Call internal API to create transcript (ensure UUIDs are strings for JSON)
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{api_url}/api/internal/transcript",
                json={
                    "job_id": job_id,
                    "project_id": str(project_id),
                    "asset_id": str(media_asset_id),
                    "transcript_scope": transcript_scope,
                    "raw_text": result["raw_text"],
                    "cleaned_text": result.get("cleaned_text"),
                    "segments": result.get("segments"),
                    "word_timestamps": result.get("word_timestamps"),
                    "language": result.get("language", "en"),
                },
            )
            r.raise_for_status()
    except Exception as e:
        await update_job("failed", str(e), str(e))
        raise
