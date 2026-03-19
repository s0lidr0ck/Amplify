"""ARQ task: import a project source video from YouTube."""

import asyncio
import mimetypes
from pathlib import Path

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from yt_dlp import YoutubeDL

from worker.config import settings

_SERVICES_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _get_upload_dir() -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _SERVICES_ROOT / upload_dir
    return upload_dir


async def download_youtube_source(ctx: dict, job_id: str, asset_id: str, source_url: str):
    """Download a YouTube source video and attach it to the source asset."""
    api_url = settings.api_url.rstrip("/")
    loop = asyncio.get_running_loop()

    async def update_job(
        status: str,
        message: str,
        *,
        progress_percent: int | None = None,
        error_text: str | None = None,
    ):
        payload: dict = {
            "status": status,
            "current_message": message,
            "error_text": error_text,
        }
        if progress_percent is not None:
            payload["progress_percent"] = progress_percent
        async with httpx.AsyncClient(timeout=20.0) as client:
            await client.post(f"{api_url}/api/internal/jobs/{job_id}/update", json=payload)

    try:
        await update_job("running", "Validating YouTube link...", progress_percent=5)
    except Exception:
        pass

    upload_dir = _get_upload_dir()
    engine = create_async_engine(
        settings.database_url_clean(),
        connect_args=settings.database_connect_args(),
        echo=False,
    )
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        result = await session.execute(
            text(
                """
                SELECT storage_key
                FROM media_assets
                WHERE id = :asset_id
                """
            ),
            {"asset_id": asset_id},
        )
        row = result.fetchone()
        if not row:
            await engine.dispose()
            raise ValueError(f"Source asset {asset_id} not found")
        storage_key = row[0]
    await engine.dispose()

    output_dir = upload_dir / storage_key
    info_holder: dict = {}

    def progress_hook(data: dict):
        status = data.get("status")
        if status == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            downloaded = data.get("downloaded_bytes")
            if total and downloaded:
                ratio = max(0.0, min(1.0, float(downloaded) / float(total)))
                percent = 10 + int(ratio * 75)
                message = f"Downloading from YouTube... {int(ratio * 100)}%"
            else:
                percent = 35
                message = "Downloading from YouTube..."
        elif status == "finished":
            percent = 90
            message = "Download finished. Finalizing source asset..."
        else:
            return

        try:
            asyncio.run_coroutine_threadsafe(
                update_job("running", message, progress_percent=percent),
                loop,
            )
        except Exception:
            pass

    def run_download():
        output_dir.mkdir(parents=True, exist_ok=True)
        options = {
            "format": "bv*+ba/best",
            "merge_output_format": "mp4",
            "noplaylist": True,
            "outtmpl": str(output_dir / "%(title)s.%(ext)s"),
            "progress_hooks": [progress_hook],
            "quiet": True,
            "no_warnings": True,
        }
        with YoutubeDL(options) as ydl:
            info = ydl.extract_info(source_url, download=True)
            info_holder["info"] = info
            requested_downloads = info.get("requested_downloads") or []
            filepath = None
            if requested_downloads:
                filepath = requested_downloads[0].get("filepath")
            if not filepath:
                filepath = ydl.prepare_filename(info)
                merged = Path(filepath).with_suffix(".mp4")
                if merged.exists():
                    filepath = str(merged)
            if not filepath:
                downloaded_files = [path for path in output_dir.iterdir() if path.is_file()]
                if downloaded_files:
                    filepath = str(max(downloaded_files, key=lambda path: path.stat().st_mtime))
            info_holder["filepath"] = filepath

    try:
        await loop.run_in_executor(None, run_download)
        file_path_value = info_holder.get("filepath")
        if not file_path_value:
            raise FileNotFoundError(f"No downloaded file was produced for source asset {asset_id}")
        file_path = Path(file_path_value)
        info = info_holder.get("info") or {}
        if not file_path.exists():
            raise FileNotFoundError(f"Downloaded file not found: {file_path}")

        mime_type = mimetypes.guess_type(file_path.name)[0] or "video/mp4"
        await update_job("running", "Registering imported source...", progress_percent=95)

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{api_url}/api/internal/youtube-import-complete",
                json={
                    "job_id": job_id,
                    "asset_id": asset_id,
                    "filename": file_path.name,
                    "mime_type": mime_type,
                    "duration_seconds": info.get("duration"),
                    "width": info.get("width"),
                    "height": info.get("height"),
                },
            )
            response.raise_for_status()
    except Exception as exc:
        await update_job("failed", str(exc), progress_percent=95, error_text=str(exc))
        raise
