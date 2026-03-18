"""Helpers for running FastCap's real clip-ranking pipeline from Amplify."""

from __future__ import annotations

import asyncio
import importlib
import site
import sys
from pathlib import Path
from typing import Callable

_SERVICE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_REPO_ROOT = _SERVICE_ROOT.parent
_FASTCAP_ROOT = _REPO_ROOT / "FastCaption"
_VENDOR_ROOT = _SERVICE_ROOT / "api" / "vendor"


def _ensure_fastcap_imports() -> None:
    vendor_str = str(_VENDOR_ROOT)
    if _VENDOR_ROOT.exists() and vendor_str not in sys.path:
        sys.path.insert(0, vendor_str)
    try:
        user_site = site.getusersitepackages()
    except Exception:
        user_site = ""
    if user_site and user_site not in sys.path:
        sys.path.append(user_site)
    fastcap_str = str(_FASTCAP_ROOT)
    if fastcap_str not in sys.path:
        sys.path.insert(0, fastcap_str)


def _load_ranker_module():
    _ensure_fastcap_imports()
    return importlib.import_module("llm_moment_ranker")


async def rank_clips_from_analysis_dir(
    *,
    analysis_dir: Path,
    model: str,
    host: str,
    candidate_limit: int,
    output_count: int,
    logger: Callable[[str], None] | None = None,
    progress: Callable[[int, int, str], None] | None = None,
) -> dict:
    ranker = _load_ranker_module()
    return await asyncio.to_thread(
        ranker.rank_sermon_moments,
        analysis_dir,
        model,
        candidate_limit,
        output_count,
        host,
        logger,
        progress,
    )
