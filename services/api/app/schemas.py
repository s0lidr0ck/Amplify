"""Pydantic schemas."""

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


class ProjectCreate(BaseModel):
    title: str
    speaker: str
    speaker_display_name: Optional[str] = None
    sermon_date: date
    source_type: str = "upload"  # "upload" | "youtube"
    source_url: Optional[str] = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    title: str
    speaker: str
    speaker_display_name: Optional[str]
    source_type: str
    source_url: Optional[str]
    sermon_date: date
    status: str
    created_at: datetime
    updated_at: datetime


class SpeakerCreate(BaseModel):
    speaker_name: str
    display_name: str
    is_active: bool = True
    sort_order: int = 0


class SpeakerUpdate(BaseModel):
    speaker_name: str
    display_name: str
    is_active: bool = True
    sort_order: int = 0


class SpeakerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    speaker_name: str
    display_name: str
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime


class MediaAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    asset_kind: str
    source_type: Optional[str]
    storage_key: str
    mime_type: str
    filename: str
    duration_seconds: Optional[float]
    width: Optional[int]
    height: Optional[int]
    status: str
    created_at: datetime


class TrimRequest(BaseModel):
    start_seconds: float
    end_seconds: float
    use_full_file: bool = False


class ProcessingJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    job_type: str
    subject_type: Optional[str]
    subject_id: Optional[str]
    status: str
    progress_percent: Optional[int]
    current_step: Optional[str]
    current_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_text: Optional[str]
    created_at: datetime


class SignedUploadResponse(BaseModel):
    upload_url: str
    asset_id: str
    storage_key: str


class ProjectDraftWrite(BaseModel):
    payload: dict[str, Any]


class ProjectDraftRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    draft_kind: str
    payload: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class StartYoutubeImportBody(BaseModel):
    source_url: str


# ---------------------------------------------------------------------------
# Publish Workspace schemas
# ---------------------------------------------------------------------------

class PublishBundleCreate(BaseModel):
    project_id: str
    organization_id: str
    bundle_type: str = "sermon_full"  # sermon_full | reel_clip | blog_post | text_post
    label: Optional[str] = None
    thumbnail_asset_id: Optional[str] = None
    week_date: date
    notes: Optional[str] = None
    status: str = "draft"


class PublishBundleUpdate(BaseModel):
    label: Optional[str] = None
    thumbnail_asset_id: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    week_date: Optional[date] = None


class PublishVariantRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    bundle_id: str
    platform: str
    title: Optional[str]
    description: Optional[str]
    tags: Optional[Any]
    hashtags: Optional[Any]
    extra_json: Optional[Any]
    media_asset_id: Optional[str]
    scheduled_at: Optional[datetime]
    published_at: Optional[datetime]
    publish_status: str
    publish_result_json: Optional[Any]
    ai_generated: bool
    created_at: datetime
    updated_at: datetime


class PublishBundleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: str
    organization_id: str
    bundle_type: str
    label: Optional[str]
    thumbnail_asset_id: Optional[str]
    status: str
    week_date: date
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    variants: list[PublishVariantRead] = []


class PublishVariantUpsert(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[Any] = None
    hashtags: Optional[Any] = None
    extra_json: Optional[Any] = None
    media_asset_id: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    published_at: Optional[datetime] = None
    publish_status: str = "draft"
    ai_generated: bool = False


class CalendarBundleRead(PublishBundleRead):
    """Alias used for the calendar endpoint response; identical shape to BundleRead."""
    pass
