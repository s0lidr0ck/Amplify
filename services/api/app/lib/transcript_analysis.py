"""Generate and persist transcript-side analysis artifacts for clip ranking."""

from __future__ import annotations

import importlib
import json
import os
import site
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Callable

from app.config import settings

_SERVICE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_FASTCAP_ROOT_CANDIDATES = (
    _SERVICE_ROOT / "FastCaption",
    _SERVICE_ROOT.parent / "FastCaption",
)
_VENDOR_ROOT = _SERVICE_ROOT / "api" / "vendor"
REQUIRED_ANALYSIS_FILES = ("words.json", "energy.json", "cadence.json", "moments.json")


def _resolve_fastcap_root() -> Path:
    for candidate in _FASTCAP_ROOT_CANDIDATES:
        if candidate.exists():
            return candidate
    return _FASTCAP_ROOT_CANDIDATES[0]


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
    fastcap_str = str(_resolve_fastcap_root())
    if fastcap_str not in sys.path:
        sys.path.insert(0, fastcap_str)


def _load_caption_video_module():
    _ensure_fastcap_imports()
    return importlib.import_module("caption_video")


def _resolve_ffmpeg_executable() -> str:
    local_copy = _SERVICE_ROOT / "api" / "ffmpeg.exe"
    if local_copy.exists():
        return str(local_copy)
    bundled = _VENDOR_ROOT / "imageio_ffmpeg" / "binaries" / "ffmpeg-win-x86_64-v7.1.exe"
    if bundled.exists():
        return str(bundled)
    return "ffmpeg"


def _video_to_audio(video_path: Path, audio_path: Path, sample_rate: int = 16000) -> None:
    ffmpeg_exe = _resolve_ffmpeg_executable()
    ffmpeg_dir = str(Path(ffmpeg_exe).parent)
    env = os.environ.copy()
    env["PATH"] = ffmpeg_dir + os.pathsep + env.get("PATH", "")
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i",
        str(video_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ar",
        str(sample_rate),
        "-ac",
        "1",
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, env=env)
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or f"exit {result.returncode}"
        raise RuntimeError(f"ffmpeg audio extraction failed: {detail}")


def transcript_analysis_dir(project_id: str, transcript_id: str) -> Path:
    upload_dir = Path(settings.upload_dir)
    if not upload_dir.is_absolute():
        upload_dir = _SERVICE_ROOT / upload_dir
    return upload_dir / "projects" / project_id / "analysis" / transcript_id


def get_analysis_artifact_status(project_id: str, transcript_id: str) -> dict:
    analysis_dir = transcript_analysis_dir(project_id, transcript_id)
    existing_files = sorted(path.name for path in analysis_dir.glob("*.json")) if analysis_dir.is_dir() else []
    missing_files = [name for name in REQUIRED_ANALYSIS_FILES if not (analysis_dir / name).exists()]
    return {
        "analysis_dir": str(analysis_dir),
        "ready": len(missing_files) == 0,
        "missing_files": missing_files,
        "existing_files": existing_files,
    }


def build_words_payload(
    *,
    word_timestamps: list[dict] | None,
    media_name: str,
    duration_sec: float,
) -> dict:
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
        "media": {"file": media_name, "duration_sec": round(max(0.0, duration_sec), 3), "sample_rate": 16000},
        "words": words,
    }


def generate_transcript_analysis_artifacts(
    *,
    project_id: str,
    transcript_id: str,
    sermon_path: Path,
    media_name: str,
    duration_seconds: float,
    transcript_text: str,
    word_timestamps: list[dict] | None,
    logger: Callable[[str], None] | None = None,
    progress_callback: Callable[[str, int], None] | None = None,
) -> dict:
    caption_video = _load_caption_video_module()
    analysis_dir = transcript_analysis_dir(project_id, transcript_id)
    analysis_dir.mkdir(parents=True, exist_ok=True)

    def emit(message: str, progress_percent: int) -> None:
        if logger:
            logger(message)
        if progress_callback:
            progress_callback(message, progress_percent)

    emit("Building word timing payload from transcript segments...", 92)
    words_payload = build_words_payload(
        word_timestamps=word_timestamps,
        media_name=media_name,
        duration_sec=duration_seconds,
    )
    (analysis_dir / "words.json").write_text(json.dumps(words_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis_dir / "transcript.txt").write_text(transcript_text or "", encoding="utf-8")

    energy_payload = {"window_sec": 0.1, "hop_sec": 0.1, "frames": []}
    cadence_payload = caption_video.build_cadence_payload(words_payload, pause_threshold_sec=0.3)

    if sermon_path.exists():
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_file:
            audio_path = Path(temp_file.name)
        try:
            emit("Extracting mono WAV audio for energy analysis...", 94)
            _video_to_audio(sermon_path, audio_path, sample_rate=16000)
            emit("Computing energy map from extracted audio...", 95)
            energy_payload = caption_video.compute_energy_map(audio_path, window_sec=0.1, hop_sec=0.1)
        except Exception as exc:
            emit(f"Audio feature extraction unavailable, continuing without energy map ({exc})", 95)
        finally:
            try:
                audio_path.unlink(missing_ok=True)
            except Exception:
                pass
    else:
        emit("Sermon media file not available locally, continuing without audio energy analysis.", 94)

    emit("Building cadence phrases from transcript timing...", 96)
    emit("Assembling transcript moments for clip ranking...", 97)
    moments_payload = caption_video.build_moments_payload(words_payload, energy_payload, cadence_payload)

    emit("Saving analysis bundle for future clip ranking runs...", 98)
    (analysis_dir / "energy.json").write_text(json.dumps(energy_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis_dir / "cadence.json").write_text(json.dumps(cadence_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    (analysis_dir / "moments.json").write_text(json.dumps(moments_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"analysis_dir": str(analysis_dir), "moment_count": len(moments_payload.get("moments", []) or [])}
