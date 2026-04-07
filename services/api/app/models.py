"""SQLAlchemy models."""

import uuid
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def uuid4_str():
    return str(uuid.uuid4())


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Speaker(Base):
    __tablename__ = "speakers"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False)
    speaker_name: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    speaker: Mapped[str] = mapped_column(String(255), nullable=False)
    speaker_display_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    source_type: Mapped[str] = mapped_column(String(50), default="upload")
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sermon_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProjectContentDraft(Base):
    __tablename__ = "project_content_drafts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    draft_kind: Mapped[str] = mapped_column(String(100), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    asset_kind: Mapped[str] = mapped_column(String(50), nullable=False)
    source_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    parent_asset_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TrimOperation(Base):
    __tablename__ = "trim_operations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    source_asset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=False)
    output_asset_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=True)
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    asset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=False)
    transcript_scope: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    language: Mapped[str] = mapped_column(String(20), default="en")
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    cleaned_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    segments_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    word_timestamps_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    is_current: Mapped[bool] = mapped_column(Boolean, default=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ClipAnalysisRun(Base):
    __tablename__ = "clip_analysis_runs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    sermon_asset_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=False)
    transcript_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("transcripts.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    model_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    summary_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ClipCandidate(Base):
    __tablename__ = "clip_candidates"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    analysis_run_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("clip_analysis_runs.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    hook_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    duration_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="draft")
    selected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    analysis_payload_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    job_type: Mapped[str] = mapped_column(String(100), nullable=False)
    subject_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    subject_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), nullable=True)
    parent_job_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("processing_jobs.id"), nullable=True)
    attempt_no: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(50), default="queued")
    progress_percent: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_step: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    current_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    queue_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    worker_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    triggered_by_user_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    error_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ProcessingJobEvent(Base):
    __tablename__ = "processing_job_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    processing_job_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("processing_jobs.id"), nullable=False)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    step_code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    level: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    progress_percent: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    payload_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PublishBundle(Base):
    __tablename__ = "publish_bundles"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    project_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("projects.id"), nullable=False)
    organization_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("organizations.id"), nullable=False)
    bundle_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thumbnail_asset_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    week_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    variants: Mapped[list["PublishVariant"]] = relationship(
        "PublishVariant",
        back_populates="bundle",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class PublishVariant(Base):
    __tablename__ = "publish_variants"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uuid4_str)
    bundle_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("publish_bundles.id"), nullable=False)
    platform: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    hashtags: Mapped[Optional[list]] = mapped_column(JSONB, nullable=True)
    extra_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    media_asset_id: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), ForeignKey("media_assets.id"), nullable=True)
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    publish_status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    publish_result_json: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    bundle: Mapped["PublishBundle"] = relationship("PublishBundle", back_populates="variants")
