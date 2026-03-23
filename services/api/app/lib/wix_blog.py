"""Wix Blog publishing helpers."""

from __future__ import annotations

import mimetypes
import re
import uuid
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import settings


class WixPublishError(RuntimeError):
    """Raised when the Wix publish flow fails."""


def _headers() -> dict[str, str]:
    token = settings.wix_bearer_token.strip()
    if not token:
        raise WixPublishError("WIX_BEARER_TOKEN is not configured.")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if settings.wix_site_id.strip():
        headers["wix-site-id"] = settings.wix_site_id.strip()
    return headers


async def _fetch_published_post(post_id: str) -> dict[str, Any]:
    async with httpx.AsyncClient(base_url=settings.wix_api_base.rstrip("/"), timeout=45.0) as client:
        response = await client.get(f"/v3/posts/{post_id}", headers=_headers())
        if response.status_code >= 400:
            return {}
        payload = response.json() or {}
    return payload.get("post") or payload.get("blogPost") or payload


async def _fetch_site_base_url() -> str:
    async with httpx.AsyncClient(base_url=settings.wix_api_base.rstrip("/"), timeout=45.0) as client:
        response = await client.get("/urls-server/v2/published-site-urls", headers=_headers())
        if response.status_code >= 400:
            return ""
        payload = response.json() or {}

    urls = payload.get("urls") or []
    primary = next((item for item in urls if item.get("primary") and item.get("url")), None)
    if primary:
        return str(primary.get("url") or "").rstrip("/")
    first = next((item for item in urls if item.get("url")), None)
    return str((first or {}).get("url") or "").rstrip("/")


def _filename_from_source(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        candidate = Path(parsed.path).name
        return candidate or "featured-image"
    return Path(value).name or "featured-image"


async def _read_featured_image_bytes(source: str) -> tuple[bytes, str]:
    path = Path(source)
    if path.exists() and path.is_file():
        return path.read_bytes(), path.name

    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(source)
            if response.status_code >= 400:
                raise WixPublishError(f"Unable to download featured image: {response.text}")
            return response.content, _filename_from_source(source)

    raise WixPublishError("Featured image must be a local file path or a reachable http(s) URL.")


async def upload_wix_media_bytes(*, image_bytes: bytes, filename: str, alt_text: str) -> dict[str, Any]:
    mime_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    async with httpx.AsyncClient(base_url=settings.wix_api_base.rstrip("/"), timeout=60.0) as client:
        generate_response = await client.post(
            "/site-media/v1/files/generate-upload-url",
            headers=_headers(),
            json={
                "mimeType": mime_type,
                "fileName": filename,
                "displayName": filename,
            },
        )
        if generate_response.status_code >= 400:
            raise WixPublishError(f"Wix media upload setup failed: {generate_response.text}")

        upload_url = (generate_response.json() or {}).get("uploadUrl")
        if not upload_url:
            raise WixPublishError("Wix media upload setup succeeded but no upload URL was returned.")

        upload_response = await client.put(
            upload_url,
            headers={"Content-Type": mime_type},
            content=image_bytes,
        )
        if upload_response.status_code >= 400:
            raise WixPublishError(f"Wix media upload failed: {upload_response.text}")

    file_record = (upload_response.json() or {}).get("file")
    if not file_record:
        raise WixPublishError("Wix media upload succeeded but no file record was returned.")

    return {
        "id": file_record.get("id") or "",
        "url": file_record.get("url") or "",
        "altText": alt_text,
        "filename": file_record.get("displayName") or filename,
        "height": file_record.get("height"),
        "width": file_record.get("width"),
    }


async def upload_wix_media_image(source: str, alt_text: str) -> dict[str, Any]:
    image_bytes, filename = await _read_featured_image_bytes(source)
    return await upload_wix_media_bytes(image_bytes=image_bytes, filename=filename, alt_text=alt_text)


def _clean_inline_markdown(text: str) -> str:
    cleaned = text or ""
    cleaned = re.sub(r"!\[[^\]]*\]\(([^)]+)\)", r"\1", cleaned)
    cleaned = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)
    return unescape(cleaned.strip())


def _text_node(text: str) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "TEXT",
        "textData": {
            "text": _clean_inline_markdown(text),
            "decorations": [],
        },
    }


def _paragraph_node(text: str) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "PARAGRAPH",
        "nodes": [_text_node(text)],
    }


def _heading_node(text: str, level: int) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "HEADING",
        "nodes": [_text_node(text)],
        "headingData": {"level": max(1, min(level, 6))},
    }


def _blockquote_node(text: str) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "BLOCKQUOTE",
        "nodes": [_text_node(text)],
    }


def _image_node(image: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "IMAGE",
        "nodes": [],
        "imageData": {
            "containerData": {
                "width": {"size": "CONTENT"},
                "alignment": "CENTER",
            },
            "image": {
                "src": {"id": image.get("id") or ""},
                "width": image.get("width") or 1200,
                "height": image.get("height") or 630,
            },
            "altText": image.get("altText") or "",
            "caption": "",
        },
    }


def _list_node(items: list[str], ordered: bool) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "type": "ORDERED_LIST" if ordered else "BULLETED_LIST",
        "nodes": [
            {
                "id": str(uuid.uuid4()),
                "type": "LIST_ITEM",
                "nodes": [_paragraph_node(item)],
            }
            for item in items
        ],
    }


def markdown_to_ricos(markdown: str, leading_image: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = (markdown or "").replace("\r\n", "\n").strip()
    nodes: list[dict[str, Any]] = []
    if leading_image and (leading_image.get("id") or leading_image.get("url")):
        nodes.append(_image_node(leading_image))

    if not normalized:
        return {"nodes": nodes, "metadata": {}}

    blocks = re.split(r"\n\s*\n", normalized)

    for block in blocks:
        lines = [line.rstrip() for line in block.split("\n") if line.strip()]
        if not lines:
            continue

        if all(re.match(r"^\s*[-*]\s+", line) for line in lines):
            nodes.append(_list_node([re.sub(r"^\s*[-*]\s+", "", line) for line in lines], ordered=False))
            continue

        if all(re.match(r"^\s*\d+\.\s+", line) for line in lines):
            nodes.append(_list_node([re.sub(r"^\s*\d+\.\s+", "", line) for line in lines], ordered=True))
            continue

        if len(lines) == 1:
            heading_match = re.match(r"^(#{1,6})\s+(.*)$", lines[0])
            if heading_match:
                nodes.append(_heading_node(heading_match.group(2), len(heading_match.group(1))))
                continue

        if all(line.lstrip().startswith(">") for line in lines):
            quote = " ".join(line.lstrip()[1:].strip() for line in lines)
            nodes.append(_blockquote_node(quote))
            continue

        paragraph = "\n".join(lines)
        nodes.append(_paragraph_node(paragraph))

    return {
        "nodes": nodes,
        "metadata": {
            "version": 1,
        },
    }


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:100]


def _publish_datetime(value: str | None) -> str | None:
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if "T" in text:
        return text
    return f"{text}T12:00:00Z"


def _build_seo_data(
    *,
    title_tag: str,
    meta_description: str,
    og_title: str,
    og_description: str,
    og_image_url: str,
) -> dict[str, Any]:
    tags: list[dict[str, Any]] = [
        {"type": "title", "children": title_tag},
        {"type": "meta", "props": {"name": "description", "content": meta_description}},
        {"type": "meta", "props": {"property": "og:title", "content": og_title}},
        {"type": "meta", "props": {"property": "og:description", "content": og_description}},
    ]
    if og_image_url.strip():
        tags.extend(
            [
                {"type": "meta", "props": {"property": "og:image", "content": og_image_url.strip()}},
                {"type": "meta", "props": {"name": "twitter:image", "content": og_image_url.strip()}},
            ]
        )

    return {
        "settings": {
            "title": title_tag,
            "description": meta_description,
        },
        "tags": tags,
    }


async def publish_wix_blog_post(
    *,
    project_title: str,
    blog_title: str,
    blog_markdown: str,
    featured_image_source: str | None,
    featured_image_id: str | None,
    publish_date: str | None,
    writer_member_id: str,
    excerpt: str,
    title_tag: str,
    meta_description: str,
    og_title: str,
    og_description: str,
) -> dict[str, Any]:
    if not writer_member_id.strip():
        raise WixPublishError("Writer is required. Set WIX_BLOG_MEMBER_ID or choose a writer before publishing.")
    if not blog_title.strip():
        raise WixPublishError("Blog title is required before publishing to Wix.")
    if not blog_markdown.strip():
        raise WixPublishError("Blog body is required before publishing to Wix.")
    if not excerpt.strip():
        raise WixPublishError("Excerpt is required before publishing to Wix.")
    if not (featured_image_id or (featured_image_source or "").strip()):
        raise WixPublishError("Featured image is required before publishing to Wix.")

    uploaded_image = (
        {"id": featured_image_id.strip(), "url": "", "altText": blog_title.strip(), "filename": ""}
        if featured_image_id and featured_image_id.strip()
        else await upload_wix_media_image((featured_image_source or "").strip(), blog_title.strip())
    )
    if not uploaded_image["id"]:
        raise WixPublishError("Wix image upload did not return a usable media ID.")

    draft_payload: dict[str, Any] = {
        "title": blog_title.strip(),
        "memberId": writer_member_id.strip(),
        "excerpt": excerpt.strip(),
        "richContent": markdown_to_ricos(blog_markdown, leading_image=uploaded_image),
        "seoSlug": _slugify(blog_title or project_title),
        "seoData": _build_seo_data(
            title_tag=title_tag.strip(),
            meta_description=meta_description.strip(),
            og_title=og_title.strip(),
            og_description=og_description.strip(),
            og_image_url=(uploaded_image.get("url") or "").strip(),
        ),
        "heroImage": {
            "id": uploaded_image["id"],
            "altText": uploaded_image["altText"],
        },
        "media": {
            "displayed": True,
            "custom": True,
            "wixMedia": {
                "image": {
                    "id": uploaded_image["id"],
                }
            },
        },
    }

    first_published_date = _publish_datetime(publish_date)
    if first_published_date:
        draft_payload["firstPublishedDate"] = first_published_date

    async with httpx.AsyncClient(base_url=settings.wix_api_base.rstrip("/"), timeout=45.0) as client:
        create_response = await client.post(
            "/blog/v3/draft-posts",
            headers=_headers(),
            json={"draftPost": draft_payload},
        )
        if create_response.status_code >= 400:
            raise WixPublishError(f"Wix draft creation failed: {create_response.text}")
        created = create_response.json()
        draft = created.get("draftPost") or created.get("draft") or created
        draft_id = draft.get("id")
        if not draft_id:
            raise WixPublishError("Wix draft creation succeeded but no draft ID was returned.")

        publish_response = await client.post(
            f"/blog/v3/draft-posts/{draft_id}/publish",
            headers=_headers(),
        )
        if publish_response.status_code >= 400:
            raise WixPublishError(f"Wix publish failed: {publish_response.text}")
        published = publish_response.json() or {}

    post_id = published.get("postId") or published.get("id") or draft_id
    post = await _fetch_published_post(post_id)
    url_data = post.get("url") or draft.get("url") or {}
    permalink = url_data.get("base") or url_data.get("path") or ""
    if url_data.get("base") and url_data.get("path"):
        permalink = f"{url_data['base'].rstrip('/')}{url_data['path']}"
    elif not permalink:
        slug = post.get("slug") or draft.get("slug") or draft.get("seoSlug")
        site_base_url = await _fetch_site_base_url()
        if slug and site_base_url:
            permalink = f"{site_base_url}/post/{slug}"

    return {
        "draft_post_id": draft_id,
        "post_id": post_id,
        "status": post.get("status") or "published",
        "title": post.get("title") or blog_title.strip(),
        "preview_url": permalink,
        "raw": {
            "draft": draft,
            "published": post or published,
            "hero_image": uploaded_image,
        },
        "published_at": post.get("firstPublishedDate") or datetime.utcnow().isoformat() + "Z",
    }

