"""Server-side automation: run the full downstream pipeline for a project."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import async_session, get_db
from app.lib.job_events import append_job_event, set_job_status
from app.models import MediaAsset, ProcessingJob, Project, ProjectContentDraft, Transcript

router = APIRouter(prefix="/api/automation", tags=["automation"])
logger = logging.getLogger(__name__)


class RunAllRequest(BaseModel):
    model: str = settings.clip_analysis_model
    host: str = settings.clip_analysis_host
    candidate_limit: int = 24
    output_count: int = 10


class RunAllResponse(BaseModel):
    job_id: str
    status: str
    message: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _set(db: AsyncSession, job_id: str, status: str, message: str, pct: int | None = None) -> None:
    await set_job_status(db, job_id, status, message, pct)
    await append_job_event(db, job_id, "status", message, progress_percent=pct)
    await db.flush()
    await db.commit()


async def _poll_job(pipeline_job_id: str, child_job_id: str, label: str, timeout: int = 7200) -> None:
    """Poll a child job until it completes, fails, or times out."""
    from app.models import ProcessingJob as PJ

    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        async with async_session() as db:
            child = await db.get(PJ, child_job_id)
        if child is None:
            raise RuntimeError(f"{label}: job record disappeared")
        if child.status == "completed":
            return
        if child.status == "failed":
            raise RuntimeError(f"{label} failed: {child.error_text or 'unknown error'}")
        if child.status == "cancelled":
            raise RuntimeError(f"{label} was cancelled")
        if asyncio.get_event_loop().time() > deadline:
            raise RuntimeError(f"{label} timed out after {timeout}s")
        await asyncio.sleep(3)


async def _save_draft(project_id: str, draft_kind: str, payload: dict) -> None:
    async with async_session() as db:
        result = await db.execute(
            select(ProjectContentDraft).where(
                ProjectContentDraft.project_id == project_id,
                ProjectContentDraft.draft_kind == draft_kind,
            )
        )
        draft = result.scalar_one_or_none()
        if draft:
            draft.payload_json = payload
        else:
            db.add(ProjectContentDraft(
                id=str(uuid.uuid4()),
                project_id=project_id,
                draft_kind=draft_kind,
                payload_json=payload,
            ))
        await db.flush()
        await db.commit()


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------

async def _run_pipeline(
    pipeline_job_id: str,
    project_id: str,
    model: str,
    host: str,
    candidate_limit: int,
    output_count: int,
) -> None:
    """Full downstream pipeline, runs entirely server-side."""
    from app.lib.content_generation import (
        build_blog_post_prompt,
        build_facebook_post_prompt,
        build_scribe_prompt,
        build_thumbnail_prompt_planner,
        build_youtube_prompt,
        build_youtube_prompt_with_chapters,
        format_youtube_chapters,
        get_chapter_segments,
        parse_srt_to_chapters,
        parse_sermon_metadata,
        parse_thumbnail_prompt_variants,
        parse_youtube_response,
        srt_to_plain_text,
    )
    from app.lib.llm import LlmError, call_llm_generate
    from app.lib.transcript_analysis import generate_transcript_analysis_artifacts, get_analysis_artifact_status
    from app.routers.transcript import _run_local_transcription
    from app.routers.clips import _run_clip_analysis

    async def step(message: str, pct: int) -> None:
        async with async_session() as db:
            await _set(db, pipeline_job_id, "running", message, pct)

    try:
        # ── 0. Load project & sermon asset ──────────────────────────────────
        async with async_session() as db:
            project = await db.get(Project, project_id)
            if not project:
                raise ValueError("Project not found")

            sermon_result = await db.execute(
                select(MediaAsset)
                .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "sermon_master")
                .order_by(MediaAsset.created_at.desc())
                .limit(1)
            )
            sermon_asset = sermon_result.scalar_one_or_none()
            if not sermon_asset:
                raise ValueError("No sermon master asset found. Generate the sermon master first.")

            sermon_asset_id = str(sermon_asset.id)
            preacher_name = project.speaker_display_name or project.speaker or ""
            sermon_date = str(project.sermon_date or "")

        # ── 1. Transcript ────────────────────────────────────────────────────
        await step("Transcript: Starting transcription...", 5)

        # Check if a usable transcript already exists
        async with async_session() as db:
            existing_tx_result = await db.execute(
                select(Transcript)
                .where(
                    Transcript.project_id == project_id,
                    Transcript.transcript_scope == "sermon",
                    Transcript.is_current == True,
                )
                .order_by(Transcript.created_at.desc())
                .limit(1)
            )
            existing_tx = existing_tx_result.scalar_one_or_none()

        if existing_tx and (existing_tx.raw_text or existing_tx.cleaned_text or "").strip():
            await step("Transcript: Using existing transcript.", 10)
            transcript_id = str(existing_tx.id)
            transcript_text = existing_tx.raw_text or existing_tx.cleaned_text or ""
        else:
            # Start a new transcription job
            tx_job_id = str(uuid.uuid4())
            async with async_session() as db:
                tx_job = ProcessingJob(
                    id=tx_job_id,
                    project_id=project_id,
                    job_type="transcribe_sermon",
                    subject_type="media_asset",
                    subject_id=sermon_asset_id,
                    status="queued",
                    current_message="Transcription queued by automation",
                )
                db.add(tx_job)
                await db.flush()
                await append_job_event(db, tx_job_id, "status", "Queued by run-all automation", progress_percent=0)
                await db.commit()

            # Run transcription in-process (same path as local fallback)
            await _run_local_transcription(tx_job_id, project_id, sermon_asset_id, "sermon")
            await _poll_job(pipeline_job_id, tx_job_id, "Transcript")

            async with async_session() as db:
                tx_result = await db.execute(
                    select(Transcript)
                    .where(
                        Transcript.project_id == project_id,
                        Transcript.transcript_scope == "sermon",
                        Transcript.is_current == True,
                    )
                    .order_by(Transcript.created_at.desc())
                    .limit(1)
                )
                new_tx = tx_result.scalar_one_or_none()
                if not new_tx:
                    raise ValueError("Transcription completed but no transcript record found.")
                transcript_id = str(new_tx.id)
                transcript_text = new_tx.raw_text or new_tx.cleaned_text or ""

        if not transcript_text.strip():
            raise ValueError("Transcript text is empty — cannot continue pipeline.")

        await step("Transcript: Done.", 12)

        # ── 2. Clip artifacts ────────────────────────────────────────────────
        await step("Clip artifacts: Checking artifact bundle...", 14)
        artifact_status = get_analysis_artifact_status(project_id, transcript_id)
        if not artifact_status["ready"]:
            await step("Clip artifacts: Rebuilding artifact bundle...", 15)
            async with async_session() as db:
                tx_obj = await db.get(Transcript, transcript_id)
                asset_obj = await db.get(MediaAsset, sermon_asset_id)

            from pathlib import Path
            from app.routers.transcript import _resolve_upload_path
            source_path = _resolve_upload_path(asset_obj.storage_key, asset_obj.filename)

            await asyncio.to_thread(
                generate_transcript_analysis_artifacts,
                project_id=project_id,
                transcript_id=transcript_id,
                sermon_path=source_path,
                media_name=asset_obj.filename,
                duration_seconds=asset_obj.duration_seconds or 0.0,
                transcript_text=transcript_text,
                word_timestamps=tx_obj.word_timestamps_json,
                logger=lambda m: None,
                progress_callback=lambda m, p: None,
            )
        await step("Clip artifacts: Ready.", 18)

        # ── 3. Title & Desc (packaging) ──────────────────────────────────────
        await step("Title & Desc: Generating YouTube copy and thumbnail prompts...", 20)

        def _gen_packaging() -> dict:
            plain = srt_to_plain_text(transcript_text)
            chapters = parse_srt_to_chapters(transcript_text)
            segments = get_chapter_segments(chapters)
            yt_prompt = (
                build_youtube_prompt_with_chapters(plain, segments, preacher_name=preacher_name, date_preached=sermon_date)
                if segments
                else build_youtube_prompt(plain, preacher_name=preacher_name, date_preached=sermon_date)
            )
            yt_raw = call_llm_generate(model=model, prompt=yt_prompt, host=host)
            title, description, chapter_titles = parse_youtube_response(yt_raw, num_segments=len(segments))
            if segments:
                titled = (
                    [(s, chapter_titles[i]) for i, (s, _) in enumerate(segments)]
                    if len(chapter_titles) == len(segments)
                    else [(s, " ".join(t.split()[:5])) for s, t in segments]
                )
                description = f"{description.rstrip()}\n\n{format_youtube_chapters(titled)}".strip()
            thumb_raw = call_llm_generate(
                model=model,
                prompt=build_thumbnail_prompt_planner(plain, title, description, preacher_name=preacher_name, date_preached=sermon_date),
                host=host,
            )
            thumb_prompts = parse_thumbnail_prompt_variants(thumb_raw, youtube_title=title, youtube_description=description)
            return {"title": title, "description": description, "thumbnail_prompts": thumb_prompts, "chapter_count": len(segments)}

        packaging = await asyncio.to_thread(_gen_packaging)
        await _save_draft(project_id, "packaging", packaging)
        await step("Title & Desc: Saved.", 35)

        # ── 4. Sermon Thumbnail prompts already saved in packaging draft ─────
        await step("Sermon Thumbnail: Prompts saved with Title & Desc.", 36)

        # ── 5. Clip Lab ──────────────────────────────────────────────────────
        await step("Clip Lab: Starting clip analysis...", 38)
        from app.models import ClipAnalysisRun

        clip_run_id = str(uuid.uuid4())
        clip_job_id = str(uuid.uuid4())
        async with async_session() as db:
            db.add(ClipAnalysisRun(
                id=clip_run_id,
                project_id=project_id,
                sermon_asset_id=sermon_asset_id,
                transcript_id=transcript_id,
                status="pending",
            ))
            db.add(ProcessingJob(
                id=clip_job_id,
                project_id=project_id,
                job_type="analyze_clips",
                subject_type="clip_analysis_run",
                subject_id=clip_run_id,
                status="queued",
                current_message="Clip analysis queued by automation",
            ))
            await db.flush()
            await append_job_event(db, clip_job_id, "status", "Queued by run-all automation", progress_percent=0)
            await db.commit()

        await _run_clip_analysis(
            clip_job_id, clip_run_id, project_id, transcript_id,
            model, host, candidate_limit, output_count,
        )
        await _poll_job(pipeline_job_id, clip_job_id, "Clip Lab")
        await step("Clip Lab: Done.", 60)

        # ── 6. Blog Post ─────────────────────────────────────────────────────
        await step("Blog Post: Generating long-form article...", 62)

        def _gen_blog() -> str:
            raw = call_llm_generate(
                model=model,
                prompt=build_blog_post_prompt(transcript_text, preacher_name=preacher_name, date_preached=sermon_date),
                host=host,
            )
            return raw.strip()

        blog_markdown = await asyncio.to_thread(_gen_blog)
        await _save_draft(project_id, "blog", {"markdown": blog_markdown})
        await step("Blog Post: Saved.", 75)

        # ── 7. Text Post ─────────────────────────────────────────────────────
        await step("Text Post: Generating social post...", 77)

        def _gen_facebook() -> str:
            raw = call_llm_generate(
                model=model,
                prompt=build_facebook_post_prompt(blog_markdown),
                host=host,
            )
            return raw.strip()

        facebook_post = await asyncio.to_thread(_gen_facebook)
        await _save_draft(project_id, "facebook", {"post": facebook_post})
        await step("Text Post: Saved.", 88)

        # ── 8. Metadata Studio ───────────────────────────────────────────────
        await step("Metadata: Generating structured sermon metadata...", 90)

        def _gen_metadata() -> dict:
            raw = call_llm_generate(
                model=model,
                prompt=build_scribe_prompt(transcript_text, preacher_name=preacher_name, date_preached=sermon_date),
                host=host,
            )
            payload, warnings = parse_sermon_metadata(raw)
            return {"raw": raw, "metadata": payload, "warnings": warnings}

        metadata = await asyncio.to_thread(_gen_metadata)
        await _save_draft(project_id, "metadata", metadata)
        await step("Metadata: Saved.", 97)

        # ── Done ─────────────────────────────────────────────────────────────
        async with async_session() as db:
            await _set(db, pipeline_job_id, "completed", "All processes completed successfully.", 100)

    except Exception as exc:
        logger.exception("run-all pipeline failed for project %s job %s", project_id, pipeline_job_id)
        async with async_session() as db:
            await set_job_status(db, pipeline_job_id, "failed", f"Pipeline failed: {exc}", error_text=str(exc))
            await append_job_event(db, pipeline_job_id, "error", f"Pipeline failed: {exc}")
            await db.flush()
            await db.commit()


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------

@router.post("/projects/{project_id}/run-all", response_model=RunAllResponse)
async def run_all(
    project_id: str,
    body: RunAllRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Start the full downstream pipeline as a server-side background job."""
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify sermon master exists before accepting the job
    sermon_result = await db.execute(
        select(MediaAsset)
        .where(MediaAsset.project_id == project_id, MediaAsset.asset_kind == "sermon_master")
        .order_by(MediaAsset.created_at.desc())
        .limit(1)
    )
    if not sermon_result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="No sermon master asset found. Generate the sermon master first.")

    job_id = str(uuid.uuid4())
    job = ProcessingJob(
        id=job_id,
        project_id=project_id,
        job_type="run_all_pipeline",
        subject_type="project",
        subject_id=project_id,
        status="queued",
        current_message="Full pipeline queued",
    )
    db.add(job)
    await db.flush()
    await append_job_event(db, job_id, "status", "Full pipeline queued", progress_percent=0)
    await db.commit()

    background_tasks.add_task(
        _run_pipeline,
        job_id,
        project_id,
        body.model,
        body.host,
        body.candidate_limit,
        body.output_count,
    )

    return RunAllResponse(job_id=job_id, status="queued", message="Pipeline started. You can close the app and check back later.")
