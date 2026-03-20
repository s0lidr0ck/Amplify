"""Settings routes for admin-managed prompt templates."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.lib.prompt_settings import list_prompt_settings, update_prompt_overrides

router = APIRouter(prefix="/api/settings", tags=["settings"])


class PromptOverridesRequest(BaseModel):
    overrides: dict[str, Any]


@router.get("/prompts")
async def get_prompts():
    return {"items": list_prompt_settings()}


@router.put("/prompts")
async def save_prompts(body: PromptOverridesRequest):
    return {"items": update_prompt_overrides(body.overrides)}
