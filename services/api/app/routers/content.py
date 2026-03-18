"""Content-generation routes migrated from FastCap workflows."""

from __future__ import annotations

import asyncio
import json
from threading import Thread
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from starlette.responses import StreamingResponse

from app.lib.content_generation import (
    build_blog_post_prompt,
    build_facebook_post_prompt,
    build_reel_graphics_prompt,
    build_reel_social_prompt,
    build_scribe_prompt,
    build_thumbnail_prompt_planner,
    build_youtube_prompt,
    build_youtube_prompt_with_chapters,
    format_youtube_chapters,
    get_chapter_segments,
    parse_srt_to_chapters,
    parse_sermon_metadata,
    parse_reel_graphics_response,
    parse_reel_social_response,
    parse_thumbnail_prompt_variants,
    parse_youtube_response,
    srt_to_plain_text,
)
from app.lib.llm import LlmError, call_llm_generate

router = APIRouter(prefix="/api/content", tags=["content"])


class GenerationBase(BaseModel):
    transcript: str = Field(min_length=1)
    preacher_name: str = ""
    date_preached: str = ""
    model: str = Field(min_length=1)
    host: str = "http://127.0.0.1:11434"


class MetadataRequest(GenerationBase):
    pass


class BlogRequest(GenerationBase):
    pass


class PackagingRequest(GenerationBase):
    sermon_metadata: dict[str, Any] | None = None


class FacebookRequest(BaseModel):
    blog_post_markdown: str = Field(min_length=1)
    model: str = Field(min_length=1)
    host: str = "http://127.0.0.1:11434"


class ReelRequest(BaseModel):
    transcript_excerpt: str = Field(min_length=1)
    preacher_name: str = ""
    date_preached: str = ""
    model: str = Field(min_length=1)
    host: str = "http://127.0.0.1:11434"


def _streaming_response(worker_fn):
    async def runner():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        def push(payload: dict[str, Any]) -> None:
            loop.call_soon_threadsafe(queue.put_nowait, (json.dumps(payload) + "\n").encode("utf-8"))

        def wrapped_worker() -> None:
            try:
                worker_fn(push)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        Thread(target=wrapped_worker, daemon=True).start()

        while True:
            item = await queue.get()
            if item is None:
                break
            yield item

    return StreamingResponse(runner(), media_type="application/x-ndjson")


@router.post("/metadata/generate")
async def generate_metadata(body: MetadataRequest):
    try:
        raw = call_llm_generate(
            model=body.model,
            prompt=build_scribe_prompt(
                body.transcript,
                preacher_name=body.preacher_name,
                date_preached=body.date_preached,
            ),
            host=body.host,
        )
        payload, warnings = parse_sermon_metadata(raw)
    except (LlmError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"raw": raw, "metadata": payload, "warnings": warnings}


@router.post("/metadata/generate-stream")
async def generate_metadata_stream(body: MetadataRequest):
    def worker(push):
        try:
            push({"type": "status", "message": "Building SCRIBE prompt..."})
            prompt = build_scribe_prompt(
                body.transcript,
                preacher_name=body.preacher_name,
                date_preached=body.date_preached,
            )
            push({"type": "status", "message": "Generating metadata..."})
            raw = call_llm_generate(
                model=body.model,
                prompt=prompt,
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "delta": chunk}),
            )
            push({"type": "status", "message": "Validating JSON..."})
            payload, warnings = parse_sermon_metadata(raw)
            push({"type": "done", "raw": raw, "metadata": payload, "warnings": warnings})
        except (LlmError, ValueError) as exc:
            push({"type": "error", "message": str(exc)})

    return _streaming_response(worker)


@router.post("/blog/generate")
async def generate_blog(body: BlogRequest):
    try:
        raw = call_llm_generate(
            model=body.model,
            prompt=build_blog_post_prompt(
                body.transcript,
                preacher_name=body.preacher_name,
                date_preached=body.date_preached,
            ),
            host=body.host,
        )
    except LlmError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"markdown": raw.strip()}


@router.post("/blog/generate-stream")
async def generate_blog_stream(body: BlogRequest):
    def worker(push) -> None:
        try:
            push({"type": "status", "message": "Building prompt..."})
            prompt = build_blog_post_prompt(
                body.transcript,
                preacher_name=body.preacher_name,
                date_preached=body.date_preached,
            )
            push({"type": "status", "message": "Generating draft..."})
            raw = call_llm_generate(
                model=body.model,
                prompt=prompt,
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "delta": chunk}),
            )
            push({"type": "done", "markdown": raw.strip()})
        except LlmError as exc:
            push({"type": "error", "message": str(exc)})

    return _streaming_response(worker)


@router.post("/packaging/generate")
async def generate_packaging(body: PackagingRequest):
    plain_transcript = srt_to_plain_text(body.transcript)
    chapters = parse_srt_to_chapters(body.transcript)
    segments = get_chapter_segments(chapters)
    youtube_prompt = (
        build_youtube_prompt_with_chapters(
            plain_transcript,
            segments,
            preacher_name=body.preacher_name,
            date_preached=body.date_preached,
        )
        if segments
        else build_youtube_prompt(
            plain_transcript,
            preacher_name=body.preacher_name,
            date_preached=body.date_preached,
        )
    )

    try:
        youtube_raw = call_llm_generate(model=body.model, prompt=youtube_prompt, host=body.host)
        title, description, chapter_titles = parse_youtube_response(youtube_raw, num_segments=len(segments))
        if segments:
            titled_chapters = (
                [(start_sec, chapter_titles[index]) for index, (start_sec, _) in enumerate(segments)]
                if len(chapter_titles) == len(segments)
                else [(start_sec, " ".join(text.split()[:5])) for start_sec, text in segments]
            )
            chapter_block = format_youtube_chapters(titled_chapters)
            description = f"{description.rstrip()}\n\n{chapter_block}".strip()

        thumbnail_raw = call_llm_generate(
            model=body.model,
            prompt=build_thumbnail_prompt_planner(
                plain_transcript,
                title,
                description,
                preacher_name=body.preacher_name,
                date_preached=body.date_preached,
                sermon_metadata=body.sermon_metadata,
            ),
            host=body.host,
        )
        thumbnail_prompts = parse_thumbnail_prompt_variants(
            thumbnail_raw,
            youtube_title=title,
            youtube_description=description,
            sermon_metadata=body.sermon_metadata,
        )
    except (LlmError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "title": title,
        "description": description,
        "thumbnail_prompts": thumbnail_prompts,
        "chapter_count": len(segments),
    }


@router.post("/packaging/generate-stream")
async def generate_packaging_stream(body: PackagingRequest):
    def worker(push):
        try:
            push({"type": "status", "message": "Preparing transcript..."})
            plain_transcript = srt_to_plain_text(body.transcript)
            chapters = parse_srt_to_chapters(body.transcript)
            segments = get_chapter_segments(chapters)
            youtube_prompt = (
                build_youtube_prompt_with_chapters(
                    plain_transcript,
                    segments,
                    preacher_name=body.preacher_name,
                    date_preached=body.date_preached,
                )
                if segments
                else build_youtube_prompt(
                    plain_transcript,
                    preacher_name=body.preacher_name,
                    date_preached=body.date_preached,
                )
            )

            push({"type": "status", "message": "Generating YouTube copy..."})
            youtube_raw = call_llm_generate(
                model=body.model,
                prompt=youtube_prompt,
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "target": "youtube", "delta": chunk}),
            )
            push({"type": "status", "message": "Parsing YouTube copy..."})
            title, description, chapter_titles = parse_youtube_response(youtube_raw, num_segments=len(segments))
            if segments:
                titled_chapters = (
                    [(start_sec, chapter_titles[index]) for index, (start_sec, _) in enumerate(segments)]
                    if len(chapter_titles) == len(segments)
                    else [(start_sec, " ".join(text.split()[:5])) for start_sec, text in segments]
                )
                chapter_block = format_youtube_chapters(titled_chapters)
                description = f"{description.rstrip()}\n\n{chapter_block}".strip()

            push({"type": "status", "message": "Planning thumbnail prompts..."})
            thumbnail_raw = call_llm_generate(
                model=body.model,
                prompt=build_thumbnail_prompt_planner(
                    plain_transcript,
                    title,
                    description,
                    preacher_name=body.preacher_name,
                    date_preached=body.date_preached,
                    sermon_metadata=body.sermon_metadata,
                ),
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "target": "thumbnail", "delta": chunk}),
            )
            thumbnail_prompts = parse_thumbnail_prompt_variants(
                thumbnail_raw,
                youtube_title=title,
                youtube_description=description,
                sermon_metadata=body.sermon_metadata,
            )
            push(
                {
                    "type": "done",
                    "title": title,
                    "description": description,
                    "thumbnail_prompts": thumbnail_prompts,
                    "chapter_count": len(segments),
                    "youtube_raw": youtube_raw,
                    "thumbnail_raw": thumbnail_raw,
                }
            )
        except (LlmError, ValueError) as exc:
            push({"type": "error", "message": str(exc)})

    return _streaming_response(worker)


@router.post("/facebook/generate")
async def generate_facebook(body: FacebookRequest):
    try:
        raw = call_llm_generate(
            model=body.model,
            prompt=build_facebook_post_prompt(body.blog_post_markdown),
            host=body.host,
        )
    except LlmError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"post": raw.strip()}


@router.post("/facebook/generate-stream")
async def generate_facebook_stream(body: FacebookRequest):
    def worker(push):
        try:
            push({"type": "status", "message": "Generating Facebook copy..."})
            raw = call_llm_generate(
                model=body.model,
                prompt=build_facebook_post_prompt(body.blog_post_markdown),
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "delta": chunk}),
            )
            push({"type": "done", "post": raw.strip()})
        except LlmError as exc:
            push({"type": "error", "message": str(exc)})

    return _streaming_response(worker)


@router.post("/reel/generate-stream")
async def generate_reel_stream(body: ReelRequest):
    def worker(push):
        try:
            push({"type": "status", "message": "Generating platform copy..."})
            social_raw = call_llm_generate(
                model=body.model,
                prompt=build_reel_social_prompt(
                    body.transcript_excerpt,
                    preacher_name=body.preacher_name,
                    date_preached=body.date_preached,
                ),
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "target": "social", "delta": chunk}),
            )
            platforms = parse_reel_social_response(social_raw)

            youtube = platforms.get("youtube", {})
            youtube_title = str(youtube.get("title") or "").strip() or "Short-form sermon reel"
            youtube_description = str(youtube.get("description") or "").strip() or body.transcript_excerpt.strip()

            push({"type": "status", "message": "Planning thumbnail prompts..."})
            graphics_raw = call_llm_generate(
                model=body.model,
                prompt=build_reel_graphics_prompt(body.transcript_excerpt),
                host=body.host,
                on_chunk=lambda chunk: push({"type": "chunk", "target": "graphics", "delta": chunk}),
            )
            graphic_concepts = parse_reel_graphics_response(graphics_raw)

            push(
                {
                    "type": "done",
                    "platforms": platforms,
                    "thumbnail_prompts": graphic_concepts,
                }
            )
        except (LlmError, ValueError) as exc:
            push({"type": "error", "message": str(exc)})

    return _streaming_response(worker)
