"""Project routes."""

import json
import shutil
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import cast, delete, exists, or_, select, String
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import UserContext, get_current_user
from app.config import settings
from app.db import get_db
from app.lib.job_events import append_job_event
from app.models import (
    ClipAnalysisRun,
    ClipCandidate,
    MediaAsset,
    Organization,
    ProcessingJob,
    ProcessingJobEvent,
    Project,
    ProjectContentDraft,
    Transcript,
    TrimOperation,
)
from app.queue import get_queue
from app.schemas import ProjectCreate, ProjectDraftRead, ProjectDraftWrite, ProjectRead, StartYoutubeImportBody

router = APIRouter(prefix="/api/projects", tags=["projects"])

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent


def _excerpt_match(text: str | None, search: str, *, radius: int = 90) -> str | None:
    if not text or not search:
        return None
    lower_text = text.lower()
    lower_search = search.lower()
    match_index = lower_text.find(lower_search)
    if match_index == -1:
        return None
    start = max(0, match_index - radius)
    end = min(len(text), match_index + len(search) + radius)
    excerpt = text[start:end].replace("\n", " ").strip()
    if start > 0:
        excerpt = f"...{excerpt}"
    if end < len(text):
        excerpt = f"{excerpt}..."
    return excerpt


async def _sync_project_statuses(db: AsyncSession, project_list: list[Project]) -> None:
    if not project_list:
        return

    project_ids = [project.id for project in project_list]
    assets_result = await db.execute(
        select(MediaAsset.project_id, MediaAsset.asset_kind, MediaAsset.status).where(
            MediaAsset.project_id.in_(project_ids)
        )
    )
    transcripts_result = await db.execute(
        select(Transcript.project_id, Transcript.status, Transcript.approved_at).where(
            Transcript.project_id.in_(project_ids),
            Transcript.transcript_scope == "sermon",
            Transcript.is_current == True,
        )
    )
    clip_counts_result = await db.execute(
        select(ClipCandidate.project_id).where(ClipCandidate.project_id.in_(project_ids))
    )
    draft_counts_result = await db.execute(
        select(ProjectContentDraft.project_id, ProjectContentDraft.draft_kind).where(
            ProjectContentDraft.project_id.in_(project_ids)
        )
    )

    assets_by_project: dict[str, set[str]] = {}
    for project_id, asset_kind, asset_status in assets_result.all():
        if asset_status == "replaced":
            continue
        assets_by_project.setdefault(project_id, set()).add(asset_kind)

    transcript_state_by_project: dict[str, tuple[bool, bool]] = {}
    for project_id, transcript_status, approved_at in transcripts_result.all():
        has_transcript = transcript_status in {"ready", "approved"}
        is_approved = approved_at is not None or transcript_status == "approved"
        previous = transcript_state_by_project.get(project_id, (False, False))
        transcript_state_by_project[project_id] = (
            previous[0] or has_transcript,
            previous[1] or is_approved,
        )

    clip_projects = {project_id for (project_id,) in clip_counts_result.all()}

    drafts_by_project: dict[str, set[str]] = {}
    for project_id, draft_kind in draft_counts_result.all():
        drafts_by_project.setdefault(project_id, set()).add(draft_kind)

    for project in project_list:
        asset_kinds = assets_by_project.get(project.id, set())
        has_transcript, transcript_approved = transcript_state_by_project.get(project.id, (False, False))
        draft_kinds = drafts_by_project.get(project.id, set())

        if "reel_thumbnail" in asset_kinds or "final_reel" in asset_kinds:
            derived_status = "reel_ready"
        elif {"packaging", "facebook", "reel"} & draft_kinds:
            derived_status = "package_ready"
        elif project.id in clip_projects:
            derived_status = "clips_ready"
        elif transcript_approved:
            derived_status = "transcript_approved"
        elif has_transcript:
            derived_status = "transcript_ready"
        elif "sermon_master" in asset_kinds:
            derived_status = "sermon_ready"
        elif "source_video" in asset_kinds:
            derived_status = "source_ready"
        else:
            derived_status = "draft"

        if project.status != derived_status:
            project.status = derived_status


def _match_target_for_field(project_id: str, field: str) -> str:
    target_map = {
        "title": f"/projects/{project_id}/source",
        "speaker": f"/projects/{project_id}/metadata",
        "source": f"/projects/{project_id}/source",
        "transcript": f"/projects/{project_id}/transcript",
        "metadata": f"/projects/{project_id}/metadata",
        "blog": f"/projects/{project_id}/blog",
        "packaging": f"/projects/{project_id}/packaging",
        "facebook": f"/projects/{project_id}/packaging",
        "reel": f"/projects/{project_id}/reel",
    }
    return target_map.get(field, f"/projects/{project_id}/source")


@router.get("/library")
async def library_projects(
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
    q: str | None = None,
    speaker: str | None = None,
    status: str | None = None,
    source_type: str | None = None,
    has_reel: bool | None = None,
    has_thumbnail: bool | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = 200,
):
    """Return project library entries with optional full-workspace search."""
    search = (q or "").strip()
    speaker_filter = (speaker or "").strip()
    status_filter = (status or "").strip()
    source_filter = (source_type or "").strip()

    project_query = select(Project).where(Project.organization_id == current_user.org_id)
    if speaker_filter:
        project_query = project_query.where(
            or_(
                Project.speaker == speaker_filter,
                Project.speaker_display_name == speaker_filter,
            )
        )
    if source_filter:
        project_query = project_query.where(Project.source_type == source_filter)
    if from_date:
        project_query = project_query.where(Project.sermon_date >= from_date)
    if to_date:
        project_query = project_query.where(Project.sermon_date <= to_date)
    if has_reel is True:
        project_query = project_query.where(
            exists(
                select(MediaAsset.id).where(
                    MediaAsset.project_id == Project.id,
                    MediaAsset.asset_kind.in_(("final_reel", "reel_thumbnail")),
                    MediaAsset.status != "replaced",
                )
            )
        )
    if has_thumbnail is True:
        project_query = project_query.where(
            exists(
                select(MediaAsset.id).where(
                    MediaAsset.project_id == Project.id,
                    MediaAsset.asset_kind.in_(("sermon_thumbnail", "reel_thumbnail")),
                    MediaAsset.status != "replaced",
                )
            )
        )
    if search:
        like = f"%{search}%"
        transcript_match = exists(
            select(Transcript.id).where(
                Transcript.project_id == Project.id,
                or_(
                    Transcript.raw_text.ilike(like),
                    Transcript.cleaned_text.ilike(like),
                ),
            )
        )
        draft_match = exists(
            select(ProjectContentDraft.id).where(
                ProjectContentDraft.project_id == Project.id,
                cast(ProjectContentDraft.payload_json, String).ilike(like),
            )
        )
        project_query = project_query.where(
            or_(
                Project.title.ilike(like),
                Project.speaker.ilike(like),
                Project.speaker_display_name.ilike(like),
                Project.source_url.ilike(like),
                transcript_match,
                draft_match,
            )
        )

    project_query = project_query.order_by(Project.sermon_date.desc(), Project.created_at.desc()).limit(limit)
    projects_result = await db.execute(project_query)
    project_list = list(projects_result.scalars().all())
    if not project_list:
        return []
    await _sync_project_statuses(db, project_list)
    if status_filter:
        project_list = [project for project in project_list if project.status == status_filter]
        if not project_list:
            await db.flush()
            await db.commit()
            return []

    project_ids = [project.id for project in project_list]
    transcript_result = await db.execute(
        select(Transcript).where(Transcript.project_id.in_(project_ids), Transcript.is_current == True)
    )
    transcript_by_project: dict[str, Transcript] = {}
    for transcript_row in transcript_result.scalars().all():
        if transcript_row.project_id not in transcript_by_project:
            transcript_by_project[transcript_row.project_id] = transcript_row

    draft_result = await db.execute(
        select(ProjectContentDraft).where(ProjectContentDraft.project_id.in_(project_ids))
    )
    drafts_by_project: dict[str, list[ProjectContentDraft]] = {}
    for draft in draft_result.scalars().all():
        drafts_by_project.setdefault(draft.project_id, []).append(draft)

    assets_result = await db.execute(
        select(MediaAsset)
        .where(
            MediaAsset.project_id.in_(project_ids),
            MediaAsset.asset_kind.in_(
                ("source_video", "final_reel", "sermon_thumbnail", "reel_thumbnail")
            ),
        )
        .order_by(MediaAsset.created_at.desc())
    )
    preview_by_project: dict[str, MediaAsset] = {}
    preview_priority = {
        "reel_thumbnail": 0,
        "final_reel": 1,
        "sermon_thumbnail": 2,
        "source_video": 3,
    }
    for asset in assets_result.scalars().all():
        current = preview_by_project.get(asset.project_id)
        if current is None or preview_priority.get(asset.asset_kind, 99) < preview_priority.get(current.asset_kind, 99):
            preview_by_project[asset.project_id] = asset

    def build_search_match(project: Project) -> dict | None:
        if not search:
            return None
        field_checks = [
            ("title", project.title),
            ("speaker", project.speaker_display_name or project.speaker),
            ("source", project.source_url or ""),
        ]
        for field_name, field_value in field_checks:
            excerpt = _excerpt_match(field_value, search)
            if excerpt:
                return {
                    "field": field_name,
                    "excerpt": excerpt,
                    "target_href": _match_target_for_field(project.id, field_name),
                }

        transcript_row = transcript_by_project.get(project.id)
        if transcript_row:
            excerpt = _excerpt_match(transcript_row.cleaned_text or transcript_row.raw_text, search)
            if excerpt:
                return {
                    "field": "transcript",
                    "excerpt": excerpt,
                    "target_href": _match_target_for_field(project.id, "transcript"),
                }

        for draft in drafts_by_project.get(project.id, []):
            payload_text = json.dumps(draft.payload_json or {}, ensure_ascii=False)
            excerpt = _excerpt_match(payload_text, search)
            if excerpt:
                return {
                    "field": draft.draft_kind,
                    "excerpt": excerpt,
                    "target_href": _match_target_for_field(project.id, draft.draft_kind),
                }
        return None

    response = [
        {
            "id": project.id,
            "title": project.title,
            "speaker": project.speaker,
            "speaker_display_name": project.speaker_display_name,
            "sermon_date": project.sermon_date,
            "status": project.status,
            "updated_at": project.updated_at,
            "source_type": project.source_type,
            "source_url": project.source_url,
            "search_match": build_search_match(project),
            "preview_asset": (
                {
                    "id": preview_by_project[project.id].id,
                    "filename": preview_by_project[project.id].filename,
                    "asset_kind": preview_by_project[project.id].asset_kind,
                    "status": preview_by_project[project.id].status,
                    "mime_type": preview_by_project[project.id].mime_type,
                    "playback_url": f"{settings.api_url}/api/media/asset/{preview_by_project[project.id].id}",
                }
                if project.id in preview_by_project
                else None
            ),
        }
        for project in project_list
    ]
    await db.flush()
    await db.commit()
    return response


async def _queue_youtube_import(
    db: AsyncSession,
    *,
    project: Project,
    source_url: str,
) -> dict:
    existing_assets = (
        await db.execute(
            select(MediaAsset).where(
                MediaAsset.project_id == project.id,
                MediaAsset.asset_kind == "source_video",
            )
        )
    ).scalars().all()
    for existing_asset in existing_assets:
        existing_asset.status = "replaced"

    asset_id = str(uuid.uuid4())
    storage_key = f"projects/{project.id}/source/{asset_id}"
    asset = MediaAsset(
        id=asset_id,
        project_id=project.id,
        asset_kind="source_video",
        source_type="youtube",
        storage_key=storage_key,
        mime_type="video/mp4",
        filename="youtube-import.mp4",
        status="pending",
    )
    db.add(asset)

    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=project.id,
        job_type="import_youtube_source",
        subject_type="media_asset",
        subject_id=asset_id,
        status="queued",
        current_message="YouTube import queued",
    )
    db.add(job)
    await db.flush()
    await append_job_event(
        db,
        job_id,
        "status",
        "YouTube import queued",
        progress_percent=0,
        step_code="queued",
        payload_json={"asset_id": asset_id, "source_url": source_url},
    )
    queue = await get_queue()
    await queue.enqueue_job("download_youtube_source", job_id, asset_id, source_url)
    return {"job_id": job_id, "asset_id": asset_id}


@router.post("", response_model=ProjectRead)
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
):
    """Create a new sermon project."""
    project = Project(
        id=str(uuid.uuid4()),
        organization_id=current_user.org_id,
        title=body.title,
        speaker=body.speaker,
        speaker_display_name=body.speaker_display_name or body.speaker,
        source_type=body.source_type or "upload",
        source_url=body.source_url if (body.source_type or "upload") == "youtube" else None,
        sermon_date=body.sermon_date,
        status="draft",
    )
    db.add(project)
    await db.flush()
    if (body.source_type or "upload") == "youtube" and body.source_url:
        await _queue_youtube_import(db, project=project, source_url=body.source_url)
    await db.refresh(project)
    return project


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    db: AsyncSession = Depends(get_db),
    current_user: UserContext = Depends(get_current_user),
    limit: int = 50,
):
    """List projects for the organization."""
    result = await db.execute(
        select(Project)
        .where(Project.organization_id == current_user.org_id)
        .order_by(Project.sermon_date.desc(), Project.created_at.desc())
        .limit(limit)
    )
    project_list = list(result.scalars().all())
    await _sync_project_statuses(db, project_list)
    await db.flush()
    await db.commit()
    return project_list


@router.post("/{project_id}/upload")
async def upload_source(
    project_id: str,
    file: UploadFile = File(...),
    asset_kind: str = Form("source_video"),
    db: AsyncSession = Depends(get_db),
):
    """Direct multipart upload for source video (local dev)."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")
    content_type = file.content_type or "video/mp4"
    asset_id = str(uuid.uuid4())
    asset_folder = {
        "source_video": "source",
        "sermon_master": "sermon",
        "final_reel": "reel",
        "sermon_thumbnail": "sermon-thumbnail",
        "reel_thumbnail": "reel-thumbnail",
    }.get(asset_kind, asset_kind)
    storage_key = f"projects/{project_id}/{asset_folder}/{asset_id}"
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    dest_dir = upload_dir / storage_key
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / file.filename
    with open(dest_path, "wb") as f:
        while chunk := await file.read(8192):
            f.write(chunk)

    if asset_kind == "source_video":
        project.source_type = "upload"
        project.source_url = None

    if asset_kind == "final_reel":
        existing_assets = (
            await db.execute(
                select(MediaAsset).where(
                    MediaAsset.project_id == project_id,
                    MediaAsset.asset_kind == "final_reel",
                )
            )
        ).scalars().all()
        for existing_asset in existing_assets:
            existing_asset.status = "replaced"

        existing_reel_transcripts = (
            await db.execute(
                select(Transcript).where(
                    Transcript.project_id == project_id,
                    Transcript.transcript_scope == "reel",
                    Transcript.is_current == True,
                )
            )
        ).scalars().all()
        for existing_transcript in existing_reel_transcripts:
            existing_transcript.is_current = False
            if existing_transcript.status == "ready":
                existing_transcript.status = "replaced"

    if asset_kind in {"sermon_thumbnail", "reel_thumbnail"}:
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

    asset = MediaAsset(
        id=asset_id,
        project_id=project_id,
        asset_kind=asset_kind,
        source_type="upload",
        storage_key=storage_key,
        mime_type=content_type,
        filename=file.filename,
        status="ready",
    )
    db.add(asset)
    await db.flush()
    return {"asset_id": asset_id, "filename": file.filename}


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get a project by ID."""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    await _sync_project_statuses(db, [project])
    await db.flush()
    await db.commit()
    return project


@router.post("/{project_id}/youtube-import")
async def start_youtube_import(
    project_id: str,
    body: StartYoutubeImportBody,
    db: AsyncSession = Depends(get_db),
):
    """Queue a YouTube source import for an existing project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project.source_type = "youtube"
    project.source_url = body.source_url
    result = await _queue_youtube_import(db, project=project, source_url=body.source_url)
    return {
        "job_id": result["job_id"],
        "asset_id": result["asset_id"],
        "status": "queued",
        "message": "YouTube import queued",
    }


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Delete a project and its related records/files."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    job_ids = (
        select(ProcessingJob.id)
        .where(ProcessingJob.project_id == project_id)
        .scalar_subquery()
    )

    await db.execute(delete(ProcessingJobEvent).where(ProcessingJobEvent.processing_job_id.in_(job_ids)))
    await db.execute(delete(ProcessingJob).where(ProcessingJob.project_id == project_id))
    await db.execute(delete(ClipCandidate).where(ClipCandidate.project_id == project_id))
    await db.execute(delete(ClipAnalysisRun).where(ClipAnalysisRun.project_id == project_id))
    await db.execute(delete(ProjectContentDraft).where(ProjectContentDraft.project_id == project_id))
    await db.execute(delete(Transcript).where(Transcript.project_id == project_id))
    await db.execute(delete(TrimOperation).where(TrimOperation.project_id == project_id))
    await db.execute(delete(MediaAsset).where(MediaAsset.project_id == project_id))
    await db.execute(delete(Project).where(Project.id == project_id))
    await db.flush()

    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _PROJECT_ROOT / upload_dir
    project_dir = upload_dir / "projects" / project_id
    if project_dir.exists():
        shutil.rmtree(project_dir, ignore_errors=True)

    return Response(status_code=204)


@router.get("/{project_id}/drafts/{draft_kind}", response_model=Optional[ProjectDraftRead])
async def get_project_draft(
    project_id: str,
    draft_kind: str,
    db: AsyncSession = Depends(get_db),
):
    """Fetch a persisted content draft for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectContentDraft).where(
            ProjectContentDraft.project_id == project_id,
            ProjectContentDraft.draft_kind == draft_kind,
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        return None
    return ProjectDraftRead(
        id=draft.id,
        project_id=draft.project_id,
        draft_kind=draft.draft_kind,
        payload=draft.payload_json or {},
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.put("/{project_id}/drafts/{draft_kind}", response_model=ProjectDraftRead)
async def save_project_draft(
    project_id: str,
    draft_kind: str,
    body: ProjectDraftWrite,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a persisted content draft for a project."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(
        select(ProjectContentDraft).where(
            ProjectContentDraft.project_id == project_id,
            ProjectContentDraft.draft_kind == draft_kind,
        )
    )
    draft = result.scalar_one_or_none()
    if not draft:
        draft = ProjectContentDraft(
            id=str(uuid.uuid4()),
            project_id=project_id,
            draft_kind=draft_kind,
            payload_json=body.payload,
        )
        db.add(draft)
    else:
        draft.payload_json = body.payload

    await db.flush()
    await db.refresh(draft)
    return ProjectDraftRead(
        id=draft.id,
        project_id=draft.project_id,
        draft_kind=draft.draft_kind,
        payload=draft.payload_json or {},
        created_at=draft.created_at,
        updated_at=draft.updated_at,
    )


@router.get("/{project_id}/sermon-asset", response_model=Optional[dict])
async def get_sermon_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the sermon master media asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "sermon_master")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
    }


@router.get("/{project_id}/source-asset", response_model=Optional[dict])
async def get_source_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the source media asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "source_video")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    playback_url = f"{settings.api_url}/api/media/asset/{asset.id}"
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
        "playback_url": playback_url,
    }


@router.get("/{project_id}/reel-asset", response_model=Optional[dict])
async def get_reel_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the uploaded final reel asset for a project."""
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "final_reel")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    playback_url = f"{settings.api_url}/api/media/asset/{asset.id}"
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
        "playback_url": playback_url,
    }


async def _get_project_asset_by_kind(
    project_id: str,
    asset_kind: str,
    db: AsyncSession,
) -> Optional[dict]:
    result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == asset_kind)
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    asset = result.scalar_one_or_none()
    if not asset:
        return None
    playback_url = f"{settings.api_url}/api/media/asset/{asset.id}"
    return {
        "id": asset.id,
        "project_id": asset.project_id,
        "asset_kind": asset.asset_kind,
        "filename": asset.filename,
        "mime_type": asset.mime_type,
        "duration_seconds": asset.duration_seconds,
        "status": asset.status,
        "storage_key": asset.storage_key,
        "playback_url": playback_url,
    }


@router.get("/{project_id}/sermon-thumbnail-asset", response_model=Optional[dict])
async def get_sermon_thumbnail_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the uploaded sermon thumbnail asset for a project."""
    return await _get_project_asset_by_kind(project_id, "sermon_thumbnail", db)


@router.get("/{project_id}/reel-thumbnail-asset", response_model=Optional[dict])
async def get_reel_thumbnail_asset(
    project_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Get the uploaded reel thumbnail asset for a project."""
    return await _get_project_asset_by_kind(project_id, "reel_thumbnail", db)
