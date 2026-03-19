"""Speaker routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Project, Speaker
from app.routers.projects import DEFAULT_ORG_ID
from app.schemas import SpeakerCreate, SpeakerRead, SpeakerUpdate

router = APIRouter(prefix="/api/speakers", tags=["speakers"])


@router.get("", response_model=list[SpeakerRead])
async def list_speakers(
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = False,
):
    query = select(Speaker).where(Speaker.organization_id == DEFAULT_ORG_ID)
    if not include_inactive:
        query = query.where(Speaker.is_active == True)
    query = query.order_by(Speaker.sort_order.asc(), func.lower(Speaker.display_name).asc())
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("", response_model=SpeakerRead)
async def create_speaker(
    body: SpeakerCreate,
    db: AsyncSession = Depends(get_db),
):
    speaker = Speaker(
        id=str(uuid.uuid4()),
        organization_id=DEFAULT_ORG_ID,
        speaker_name=body.speaker_name.strip(),
        display_name=body.display_name.strip(),
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    db.add(speaker)
    await db.flush()
    await db.refresh(speaker)
    return speaker


@router.put("/{speaker_id}", response_model=SpeakerRead)
async def update_speaker(
    speaker_id: str,
    body: SpeakerUpdate,
    db: AsyncSession = Depends(get_db),
):
    speaker = await db.get(Speaker, speaker_id)
    if not speaker or speaker.organization_id != DEFAULT_ORG_ID:
        raise HTTPException(status_code=404, detail="Speaker not found")

    speaker.speaker_name = body.speaker_name.strip()
    speaker.display_name = body.display_name.strip()
    speaker.is_active = body.is_active
    speaker.sort_order = body.sort_order
    await db.flush()
    await db.refresh(speaker)
    return speaker


@router.delete("/{speaker_id}", status_code=204)
async def delete_speaker(
    speaker_id: str,
    db: AsyncSession = Depends(get_db),
):
    speaker = await db.get(Speaker, speaker_id)
    if not speaker or speaker.organization_id != DEFAULT_ORG_ID:
        raise HTTPException(status_code=404, detail="Speaker not found")

    in_use = await db.execute(
        select(Project.id).where(
            Project.organization_id == DEFAULT_ORG_ID,
            Project.speaker == speaker.speaker_name,
        ).limit(1)
    )
    if in_use.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="This speaker is already used by one or more projects. Edit it or deactivate it instead.",
        )

    await db.delete(speaker)
    await db.flush()
    return Response(status_code=204)
