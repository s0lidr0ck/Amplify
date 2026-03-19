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
