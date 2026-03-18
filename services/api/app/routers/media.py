"""Media playback - serve uploaded files for browser playback."""

import os
from pathlib import Path
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import MediaAsset

router = APIRouter(prefix="/api/media", tags=["media"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent

CHUNK_SIZE = 1024 * 64  # 64KB


def _send_bytes_range(
    file_path: Path, start: int, end: int, chunk_size: int = CHUNK_SIZE
):
    """Generator that yields file bytes from start to end (inclusive)."""
    with open(file_path, "rb") as f:
        f.seek(start)
        pos = start
        while pos <= end:
            read_size = min(chunk_size, end - pos + 1)
            data = f.read(read_size)
            if not data:
                break
            pos += len(data)
            yield data


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    """Parse Range header; returns (start, end) inclusive or None if invalid."""
    if not range_header or not range_header.startswith("bytes="):
        return None
    try:
        range_spec = range_header.replace("bytes=", "").strip()
        parts = range_spec.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        if start < 0 or end >= file_size or start > end:
            return None
        return (start, end)
    except (ValueError, IndexError):
        return None


@router.get("/asset/{asset_id}")
async def stream_asset(
    asset_id: str,
    request: Request,
    range: str | None = Header(None, alias="Range"),
    db: AsyncSession = Depends(get_db),
):
    """
    Stream a media asset for playback. Supports Range requests for seeking.
    """
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
    asset = result.scalar_one_or_none()

    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")

    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    file_path = upload_dir / asset.storage_key / asset.filename

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(file_path)
    content_type = asset.mime_type or "video/mp4"

    range_result = _parse_range_header(range, file_size) if range else None

    if range_result:
        start, end = range_result
        size = end - start + 1
        headers = {
            "Content-Type": content_type,
            "Accept-Ranges": "bytes",
            "Content-Length": str(size),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
        }
        return StreamingResponse(
            _send_bytes_range(file_path, start, end),
            status_code=206,
            headers=headers,
            media_type=content_type,
        )
    else:
        headers = {
            "Content-Type": content_type,
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return StreamingResponse(
            _send_bytes_range(file_path, 0, file_size - 1),
            status_code=200,
            headers=headers,
            media_type=content_type,
        )
