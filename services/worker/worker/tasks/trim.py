"""Trim sermon task - FFmpeg trim and report completion."""

import asyncio
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from worker.config import settings

# services/worker/worker/tasks -> services (same as API's media/projects routers)
_SERVICES_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _get_upload_dir() -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _SERVICES_ROOT / upload_dir
    return upload_dir


async def trim_sermon(ctx: dict, job_id: str, trim_op_id: str):
    """
    ARQ task: trim source video to sermon master using FFmpeg.
    Reads trim_op from DB, runs FFmpeg, calls internal API to complete.
    """
    api_url = settings.api_url.rstrip("/")

    async def update_job(status: str, message: str, error_text: str | None = None):
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                f"{api_url}/api/internal/jobs/{job_id}/update",
                json={
                    "status": status,
                    "current_message": message,
                    "error_text": error_text,
                },
            )

    try:
        await update_job("running", "Trimming video...")
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
                    SELECT t.project_id, t.source_asset_id, t.start_seconds, t.end_seconds
                    FROM trim_operations t
                    WHERE t.id = :tid
                """),
                {"tid": trim_op_id},
            )
            row = result.fetchone()
            if not row:
                raise ValueError(f"Trim operation {trim_op_id} not found")

            project_id, source_asset_id, start_seconds, end_seconds = row

            result = await session.execute(
                text("""
                    SELECT storage_key, filename, mime_type
                    FROM media_assets
                    WHERE id = :aid
                """),
                {"aid": source_asset_id},
            )
            src_row = result.fetchone()
            if not src_row:
                raise ValueError(f"Source asset {source_asset_id} not found")

            storage_key, filename, mime_type = src_row

        await engine.dispose()

        upload_dir = _get_upload_dir()
        source_path = upload_dir / storage_key / filename
        if not source_path.exists():
            raise FileNotFoundError(f"Source file not found: {source_path}")

        output_dir = upload_dir / f"projects/{project_id}/sermon/{job_id}"
        output_dir.mkdir(parents=True, exist_ok=True)
        ext = Path(filename).suffix or ".mp4"
        output_filename = f"sermon_{Path(filename).stem}{ext}"
        output_path = output_dir / output_filename

        # FFmpeg: -ss before -i for fast seek, -to for duration, -c copy for no re-encode
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(start_seconds),
            "-i", str(source_path),
            "-to", str(end_seconds - start_seconds),
            "-c", "copy",
            str(output_path),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            err_msg = stderr.decode()[:500]
            await update_job("failed", "FFmpeg failed", err_msg)
            raise RuntimeError(f"FFmpeg failed: {err_msg}")

        duration_seconds = float(end_seconds - start_seconds)

        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.post(
                f"{api_url}/api/internal/trim-complete",
                json={
                    "job_id": job_id,
                    "trim_op_id": trim_op_id,
                    "output_filename": output_filename,
                    "duration_seconds": duration_seconds,
                },
            )
            r.raise_for_status()
    except Exception as e:
        await update_job("failed", str(e), str(e))
        raise
