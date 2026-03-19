"""Bridge to the FastCap clip-analysis pipeline."""

from __future__ import annotations

import asyncio
import importlib
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_FASTCAP_ROOT_CANDIDATES = (
    _PROJECT_ROOT / "app" / "lib" / "fastcap_runtime",
    _PROJECT_ROOT / "FastCaption",
    _PROJECT_ROOT.parent / "FastCaption",
)


def _resolve_fastcap_root() -> Path:
    for candidate in _FASTCAP_ROOT_CANDIDATES:
        if candidate.exists():
            return candidate
    return _FASTCAP_ROOT_CANDIDATES[0]


def _ensure_fastcap_imports() -> None:
    fastcap_str = str(_resolve_fastcap_root())
    if fastcap_str not in sys.path:
        sys.path.insert(0, fastcap_str)


def _load_fastcap_modules():
    _ensure_fastcap_imports()
    caption_video = importlib.import_module("caption_video")
    llm_moment_ranker = importlib.import_module("llm_moment_ranker")
    return caption_video, llm_moment_ranker


def build_words_payload(word_timestamps: list[dict] | None, media_name: str, duration_sec: float) -> dict:
    words = []
    for item in word_timestamps or []:
        token = str(item.get("word", "")).strip()
        if not token:
            continue
        start = float(item.get("start", 0.0) or 0.0)
        end = float(item.get("end", start) or start)
        words.append({"w": token, "s": round(start, 3), "e": round(end, 3), "c": 1.0})
    if words and duration_sec <= 0:
        duration_sec = float(words[-1]["e"])
    return {
        "media": {
            "file": media_name,
            "duration_sec": round(max(0.0, duration_sec), 3),
            "sample_rate": 16000,
        },
        "words": words,
    }


def _format_progress(label: str) -> str:
    return label if label.endswith("...") or label.endswith(".") else f"{label}..."


async def rank_clip_candidates(
    *,
    sermon_path: Path,
    media_name: str,
    word_timestamps: list[dict] | None,
    duration_seconds: float,
    model: str,
    host: str,
    candidate_limit: int,
    output_count: int,
    log: Callable[[str], None] | None = None,
    progress: Callable[[int, str], None] | None = None,
) -> dict:
    caption_video, llm_moment_ranker = _load_fastcap_modules()

    words_payload = build_words_payload(word_timestamps, media_name=media_name, duration_sec=duration_seconds)

    if progress:
        progress(5, _format_progress("Extracting audio for energy analysis"))

    def compute_rank_result() -> dict:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            audio_path = Path(temp_file.name)
        try:
            caption_video.video_to_audio(sermon_path, audio_path, sample_rate=16000)
            energy_payload = caption_video.compute_energy_map(audio_path, window_sec=0.1, hop_sec=0.1)
            cadence_payload = caption_video.build_cadence_payload(words_payload, pause_threshold_sec=0.3)
            return llm_moment_ranker.rank_sermon_moments_from_payloads(
                words_payload=words_payload,
                energy_payload=energy_payload,
                cadence_payload=cadence_payload,
                model=model,
                output_count=output_count,
                candidate_limit=candidate_limit,
                host=host,
                logger=log,
            )
        finally:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass

    return await asyncio.to_thread(compute_rank_result)
