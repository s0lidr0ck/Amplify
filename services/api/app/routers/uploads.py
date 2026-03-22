"""Upload routes for local chunked uploads and future signed URLs."""

import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import MediaAsset, Project

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_TMP_UPLOAD_DIRNAME = "_multipart"


class RequestUploadBody(BaseModel):
    project_id: str
    filename: str
    content_type: str
    file_size_bytes: int


class RequestUploadResponse(BaseModel):
    upload_url: str
    asset_id: str
    storage_key: str


class StartLocalUploadBody(BaseModel):
    project_id: str
    filename: str
    content_type: str
    file_size_bytes: int
    chunk_size_bytes: int
    total_parts: int
    asset_kind: str = "source_video"


class StartLocalUploadResponse(BaseModel):
    upload_id: str
    chunk_size_bytes: int
    total_parts: int


class CompleteLocalUploadBody(BaseModel):
    project_id: str
    asset_kind: str = "source_video"


class CompleteLocalUploadResponse(BaseModel):
    asset_id: str
    filename: str


def _get_upload_root() -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    return upload_dir


def _get_upload_session_dir(upload_id: str) -> Path:
    return _get_upload_root() / _TMP_UPLOAD_DIRNAME / upload_id


def _get_meta_path(upload_id: str) -> Path:
    return _get_upload_session_dir(upload_id) / "meta.json"


def _load_upload_meta(upload_id: str) -> dict:
    meta_path = _get_meta_path(upload_id)
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Upload session not found")
    try:
        return json.loads(meta_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Upload session is corrupted") from exc


def _save_upload_meta(upload_id: str, meta: dict) -> None:
    session_dir = _get_upload_session_dir(upload_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    _get_meta_path(upload_id).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _asset_folder_for_kind(asset_kind: str) -> str:
    return {
        "source_video": "source",
        "sermon_master": "sermon",
        "final_reel": "reel",
        "sermon_thumbnail": "sermon-thumbnail",
        "reel_thumbnail": "reel-thumbnail",
    }.get(asset_kind, asset_kind)


async def _mark_replaced_assets(project_id: str, asset_kind: str, db: AsyncSession) -> None:
    if asset_kind not in {"source_video", "final_reel", "sermon_thumbnail", "reel_thumbnail"}:
        return
    existing_assets = (
        await db.execute(
            select(MediaAsset).where(
                MediaAsset.project_id == project_id,
                MediaAsset.asset_kind == asset_kind,
            )
        )
    ).scalars().all()
    for existing_asset in existing_assets:
        existing_asset.status = "replaced"


@router.post("/request", response_model=RequestUploadResponse)
async def request_upload(
    body: RequestUploadBody,
    db: AsyncSession = Depends(get_db),
):
    """
    Request a signed URL for direct upload to object storage.
    Client uploads via PUT to the returned URL, then calls confirm_upload.
    """
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")

    asset_id = str(uuid.uuid4())
    storage_key = f"projects/{body.project_id}/source/{asset_id}"
    upload_url = f"/api/uploads/placeholder/{asset_id}"

    asset = MediaAsset(
        id=asset_id,
        project_id=body.project_id,
        asset_kind="source_video",
        source_type="upload",
        storage_key=storage_key,
        mime_type=body.content_type,
        filename=body.filename,
        status="pending",
    )
    db.add(asset)
    await db.flush()

    return RequestUploadResponse(
        upload_url=upload_url,
        asset_id=asset_id,
        storage_key=storage_key,
    )


@router.post("/local/start", response_model=StartLocalUploadResponse)
async def start_local_upload(
    body: StartLocalUploadBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == body.project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Project not found")
    if not body.filename.strip():
        raise HTTPException(status_code=400, detail="Filename is required")
    if body.file_size_bytes <= 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if body.chunk_size_bytes <= 0 or body.total_parts <= 0:
        raise HTTPException(status_code=400, detail="Invalid chunk metadata")

    upload_id = str(uuid.uuid4())
    _save_upload_meta(
        upload_id,
        {
            "project_id": body.project_id,
            "filename": body.filename,
            "content_type": body.content_type or "application/octet-stream",
            "file_size_bytes": body.file_size_bytes,
            "chunk_size_bytes": body.chunk_size_bytes,
            "total_parts": body.total_parts,
            "asset_kind": body.asset_kind,
            "received_parts": [],
        },
    )
    return StartLocalUploadResponse(
        upload_id=upload_id,
        chunk_size_bytes=body.chunk_size_bytes,
        total_parts=body.total_parts,
    )


@router.put("/local/{upload_id}/parts/{part_number}")
async def upload_local_part(
    upload_id: str,
    part_number: int,
    chunk: UploadFile = File(...),
):
    meta = _load_upload_meta(upload_id)
    total_parts = int(meta["total_parts"])
    if part_number < 1 or part_number > total_parts:
        raise HTTPException(status_code=400, detail="Invalid part number")

    session_dir = _get_upload_session_dir(upload_id)
    session_dir.mkdir(parents=True, exist_ok=True)
    part_path = session_dir / f"part-{part_number:05d}"
    with open(part_path, "wb") as handle:
        while data := await chunk.read(1024 * 1024):
            handle.write(data)

    received_parts = {int(part) for part in meta.get("received_parts", [])}
    received_parts.add(part_number)
    meta["received_parts"] = sorted(received_parts)
    _save_upload_meta(upload_id, meta)
    return {"ok": True, "part_number": part_number}


@router.post("/local/{upload_id}/complete", response_model=CompleteLocalUploadResponse)
async def complete_local_upload(
    upload_id: str,
    body: CompleteLocalUploadBody,
    db: AsyncSession = Depends(get_db),
):
    meta = _load_upload_meta(upload_id)
    if meta["project_id"] != body.project_id:
        raise HTTPException(status_code=400, detail="Upload session does not match project")
    if meta.get("asset_kind", "source_video") != body.asset_kind:
        raise HTTPException(status_code=400, detail="Upload session does not match asset kind")

    total_parts = int(meta["total_parts"])
    received_parts = {int(part) for part in meta.get("received_parts", [])}
    expected_parts = set(range(1, total_parts + 1))
    if received_parts != expected_parts:
        raise HTTPException(status_code=400, detail="Upload is missing one or more chunks")

    project = await db.get(Project, body.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    asset_id = str(uuid.uuid4())
    asset_kind = body.asset_kind
    storage_key = f"projects/{body.project_id}/{_asset_folder_for_kind(asset_kind)}/{asset_id}"
    dest_dir = _get_upload_root() / storage_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / meta["filename"]

    session_dir = _get_upload_session_dir(upload_id)
    with open(dest_path, "wb") as destination:
        for part_number in range(1, total_parts + 1):
            part_path = session_dir / f"part-{part_number:05d}"
            if not part_path.exists():
                raise HTTPException(status_code=400, detail=f"Missing chunk {part_number}")
            with open(part_path, "rb") as source:
                shutil.copyfileobj(source, destination)

    await _mark_replaced_assets(body.project_id, asset_kind, db)

    if asset_kind == "source_video":
        project.source_type = "upload"
        project.source_url = None

    asset = MediaAsset(
        id=asset_id,
        project_id=body.project_id,
        asset_kind=asset_kind,
        source_type="upload",
        storage_key=storage_key,
        mime_type=meta["content_type"],
        filename=meta["filename"],
        status="ready",
    )
    db.add(asset)
    await db.flush()

    shutil.rmtree(session_dir, ignore_errors=True)
    return CompleteLocalUploadResponse(asset_id=asset_id, filename=meta["filename"])
