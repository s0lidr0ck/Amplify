"""Centralized storage layer — local disk and AWS S3.

All media assets start on local disk. After 14 days a background archival
job uploads them to S3 and removes the local copy.  Playback and processing
routes call ``ensure_local_file`` which transparently re-downloads from S3
when needed.
"""

import asyncio
import logging
import tempfile
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import boto3
from botocore.config import Config

from app.config import settings

logger = logging.getLogger(__name__)

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

# All S3 objects live under this prefix inside the bucket.
_S3_PREFIX = "AMPLIFY"

# ──────────────────────────────────────────────
# Local-disk helpers
# ──────────────────────────────────────────────


def get_upload_root() -> Path:
    """Return the absolute path to the local upload directory."""
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir


def resolve_local_path(storage_key: str, filename: str) -> Path:
    """Return the expected on-disk path for an asset (may not exist if archived)."""
    return get_upload_root() / storage_key / filename


# ──────────────────────────────────────────────
# S3 helpers
# ──────────────────────────────────────────────


def s3_object_key(storage_key: str, filename: str) -> str:
    """Return the full S3 object key for an asset (prefixed with AMPLIFY/)."""
    return f"{_S3_PREFIX}/{storage_key}/{filename}"


@lru_cache(maxsize=1)
def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=settings.s3_region or "us-east-1",
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(signature_version="s3v4"),
    )


def upload_to_s3(local_path: Path, storage_key: str, filename: str) -> None:
    """Upload a local file to S3.  Runs synchronously (call via asyncio.to_thread)."""
    key = s3_object_key(storage_key, filename)
    logger.info("Uploading %s → s3://%s/%s", local_path, settings.s3_bucket, key)
    _get_s3_client().upload_file(str(local_path), settings.s3_bucket, key)


def download_from_s3(storage_key: str, filename: str, dest_path: Path) -> None:
    """Download an S3 object to *dest_path*.  Runs synchronously."""
    key = s3_object_key(storage_key, filename)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading s3://%s/%s → %s", settings.s3_bucket, key, dest_path)
    _get_s3_client().download_file(settings.s3_bucket, key, str(dest_path))


def get_presigned_url(storage_key: str, filename: str, expires: int = 3600) -> str:
    """Return a presigned GET URL for an S3 object (default 1-hour TTL)."""
    key = s3_object_key(storage_key, filename)
    return _get_s3_client().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_bucket, "Key": key},
        ExpiresIn=expires,
    )


# ──────────────────────────────────────────────
# Unified access helper
# ──────────────────────────────────────────────


def ensure_local_file(storage_key: str, filename: str, storage_backend: str) -> Path:
    """Return an absolute local path to the media file.

    * ``storage_backend == 'local'``: returns the on-disk path (may not
      exist if the file was manually deleted).
    * ``storage_backend == 's3'``: downloads the object from S3 to a
      temporary file and returns that path.

    **Important**: for S3 assets the returned path is a named temp file.
    The caller should delete it when done (``path.unlink(missing_ok=True)``).
    Use :func:`is_s3_temp_path` to check.
    """
    if storage_backend == "local":
        return resolve_local_path(storage_key, filename)

    suffix = Path(filename).suffix or ".bin"
    tmp = tempfile.NamedTemporaryFile(
        delete=False,
        suffix=suffix,
        prefix="amplify_s3_",
    )
    tmp.close()
    dest = Path(tmp.name)
    download_from_s3(storage_key, filename, dest)
    return dest


def is_s3_temp_path(path: Path) -> bool:
    """Return True if *path* was created by :func:`ensure_local_file` for an S3 asset."""
    return path.name.startswith("amplify_s3_")


# ──────────────────────────────────────────────
# Daily archival job
# ──────────────────────────────────────────────


async def archive_old_assets(max_age_days: int = 14) -> dict:
    """Move local MediaAssets older than *max_age_days* to S3.

    For each qualifying asset:
    - uploads the file to S3 (``AMPLIFY/{storage_key}/{filename}``)
    - deletes the local copy
    - sets ``storage_backend = 's3'`` in the database

    Returns a summary ``{"archived": N, "missing": N, "errors": N}``.
    """
    from sqlalchemy import select

    from app.db import async_session
    from app.models import MediaAsset

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    archived = 0
    missing = 0
    errors = 0

    async with async_session() as db:
        result = await db.execute(
            select(MediaAsset).where(
                MediaAsset.storage_backend == "local",
                MediaAsset.created_at < cutoff,
                MediaAsset.status.in_(["ready", "replaced"]),
            )
        )
        assets = result.scalars().all()

    logger.info("S3 archival: %d asset(s) eligible (older than %d days)", len(assets), max_age_days)

    for asset in assets:
        local_path = resolve_local_path(asset.storage_key, asset.filename)
        try:
            if not local_path.exists():
                # File already gone — update record so we stop checking it
                async with async_session() as db:
                    db_asset = await db.get(MediaAsset, asset.id)
                    if db_asset:
                        db_asset.storage_backend = "s3"
                        await db.commit()
                missing += 1
                continue

            await asyncio.to_thread(upload_to_s3, local_path, asset.storage_key, asset.filename)
            local_path.unlink(missing_ok=True)
            # Best-effort cleanup of the now-empty asset directory
            try:
                local_path.parent.rmdir()
            except OSError:
                pass

            async with async_session() as db:
                db_asset = await db.get(MediaAsset, asset.id)
                if db_asset:
                    db_asset.storage_backend = "s3"
                    await db.commit()

            archived += 1
            logger.info("Archived asset %s (%s)", asset.id, asset.filename)

        except Exception as exc:
            logger.error("Failed to archive asset %s: %s", asset.id, exc)
            errors += 1

    logger.info(
        "S3 archival complete: archived=%d missing=%d errors=%d",
        archived, missing, errors,
    )
    return {"archived": archived, "missing": missing, "errors": errors}


async def archival_loop(max_age_days: int = 14, interval_hours: int = 24) -> None:
    """Background task: run :func:`archive_old_assets` on a recurring schedule.

    Waits 60 seconds after startup before the first run so the API is fully
    ready, then repeats every *interval_hours*.
    """
    await asyncio.sleep(60)
    while True:
        try:
            await archive_old_assets(max_age_days=max_age_days)
        except Exception as exc:
            logger.error("Archival loop error: %s", exc)
        await asyncio.sleep(interval_hours * 3600)
