"""What the worker actually does.

One function per job type, each registered with the loop. They receive the
hub, the job, and a scratch directory that is deleted afterwards whatever
happens.

The shape is the same every time: fetch the input by signed URL, do the work
with a real binary, push the output back by signed URL, return what was made.
Nothing here chooses an S3 path or holds a credential — that is deliberate,
and it is why a bug in this file cannot put one church's sermon in another
church's folder.
"""

from __future__ import annotations

import json
import logging
import subprocess
from pathlib import Path

import httpx

from worker.config import settings
from worker.hub import Hub, Job
from worker.loop import handles

logger = logging.getLogger(__name__)


def _payload(job: Job) -> dict:
    if not job.payload_json:
        return {}
    try:
        return json.loads(job.payload_json)
    except json.JSONDecodeError:
        return {}


def _download(hub: Hub, job: Job, asset_id: str, into: Path) -> Path:
    """Pull an input down to the scratch directory."""
    url, filename = hub.download_url(job, asset_id)
    target = into / (filename or "input")
    # Streamed: these are whole services, not thumbnails.
    with httpx.stream("GET", url, timeout=None, follow_redirects=True) as response:
        response.raise_for_status()
        with open(target, "wb") as handle:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                handle.write(chunk)
    return target


def _run(cmd: list[str], job: Job, hub: Hub) -> None:
    """Run a binary, and put its complaint somewhere a human will see it."""
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # ffmpeg's real explanation is on the last few lines of stderr; the
        # first lines are build flags nobody needs.
        tail = "\n".join((result.stderr or "").strip().splitlines()[-6:])
        hub.log(job, f"{cmd[0]} failed:\n{tail}", level="error")
        raise RuntimeError(f"{cmd[0]} failed: {tail[:400]}")


def _probe_duration(path: Path) -> float | None:
    """Ask the file how long it is rather than trusting the request."""
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            capture_output=True,
            text=True,
        )
        return float(out.stdout.strip()) if out.returncode == 0 else None
    except (ValueError, OSError):
        return None


@handles("trim")
def trim(hub: Hub, job: Job, scratch: Path) -> list[dict[str, object]]:
    """Cut the sermon out of the full service recording."""
    payload = _payload(job)
    source_asset_id = payload.get("sourceAssetId") or job.subject_id
    if not source_asset_id:
        raise ValueError("No source asset to trim")

    start = float(payload.get("startSeconds", 0))
    end = float(payload.get("endSeconds", 0))
    if end <= start:
        raise ValueError("The end of the sermon must come after the start")

    hub.progress(job, 5, "Fetching the source")
    source = _download(hub, job, str(source_asset_id), scratch)

    hub.progress(job, 30, "Trimming")
    output = scratch / "sermon-master.mp4"
    _run(
        [
            "ffmpeg", "-y",
            # -ss before -i seeks by index rather than decoding to the point,
            # which is the difference between seconds and minutes on a
            # two-hour file.
            "-ss", str(start),
            "-i", str(source),
            "-to", str(end - start),
            # No re-encode. The sermon is a slice of an existing file, and
            # re-encoding would cost an hour and quality for nothing.
            "-c", "copy",
            # Index at the front. Clips are cut by pointing ffmpeg at this
            # file's URL and seeking, which only works if the index can be
            # read without fetching the whole file — otherwise every clip
            # quietly pulls 39 minutes down to take 35 seconds out.
            "-movflags", "+faststart",
            str(output),
        ],
        job,
        hub,
    )

    hub.progress(job, 75, "Uploading the master")
    key = hub.upload_file(job, "sermon_master", str(output), "video/mp4")

    return [
        {
            "kind": "sermon_master",
            "storageKey": key,
            "filename": output.name,
            "mimeType": "video/mp4",
            "durationSeconds": _probe_duration(output) or (end - start),
        }
    ]


@handles("transcribe")
def transcribe(hub: Hub, job: Job, scratch: Path) -> list[dict[str, object]]:
    """Turn the sermon audio into text.

    Produces no asset — the transcript is a record, not a file, so it goes
    into Convex rather than S3. The loop reports it through `finish`.
    """
    payload = _payload(job)
    asset_id = payload.get("assetId") or job.subject_id
    if not asset_id:
        raise ValueError("No audio to transcribe")

    hub.progress(job, 5, "Fetching the audio")
    source = _download(hub, job, str(asset_id), scratch)

    # Strip to mono 16 kHz WAV first. Whisper resamples internally anyway, and
    # handing it a two-hour video stream costs memory for no benefit.
    hub.progress(job, 15, "Extracting audio")
    audio = scratch / "audio.wav"
    _run(
        [
            "ffmpeg", "-y", "-i", str(source),
            "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
            str(audio),
        ],
        job,
        hub,
    )

    hub.progress(job, 25, "Transcribing — this takes a while")
    from faster_whisper import WhisperModel  # imported late: it loads a model

    # The box decides, not this file. A machine doing five minutes of TV in
    # fifteen seconds on `small` has no business loading large-v3 by
    # default; a job may still ask for a specific model when it matters.
    model_name = payload.get("model") or settings.whisper_model
    hub.log(
        job,
        f"Transcribing with {model_name} on {settings.whisper_device}",
    )
    model = WhisperModel(
        model_name,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )
    # word_timestamps, because cadence is measured off them. Without it
    # Whisper returns phrase-level spans only, and the Clip Lab's whole
    # vocabulary — pause punch, rising intensity, stacked statements — has
    # nothing to be computed from. It was being asked for and guessed at.
    segments, info = model.transcribe(
        str(audio), vad_filter=True, word_timestamps=True
    )

    collected: list[dict[str, object]] = []
    words: list[str] = []
    timed_words: list[dict[str, object]] = []
    total = info.duration or 0
    last_reported = 25.0

    for segment in segments:
        collected.append(
            {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
        )
        words.append(segment.text.strip())
        for w in getattr(segment, "words", None) or []:
            # The shape the cadence builder speaks: start, end, word.
            timed_words.append(
                {"s": round(float(w.start), 3), "e": round(float(w.end), 3), "w": w.word}
            )

        # Report sparingly. faster-whisper yields segments continuously and a
        # call per segment would be thousands of writes on a long sermon.
        if total:
            done = 25 + (segment.end / total) * 70
            if done - last_reported >= 5:
                last_reported = done
                hub.progress(job, round(done), "Transcribing")

    # How it was said, alongside what was said.
    #
    # Here rather than in a job of its own because this one has already
    # decoded the audio and already knows where every word falls. A separate
    # job would download the sermon a second time to learn what this one is
    # holding.
    hub.progress(job, 92, "Listening to the delivery")
    analysis: dict[str, object] | None = None
    try:
        from worker.tasks.audio_analysis import (
            build_cadence_payload,
            compute_energy_map,
            extract_wav,
        )

        wav = extract_wav(audio, scratch / "analysis.wav")
        words_payload = {"words": timed_words}
        bundle = {
            "words": words_payload,
            "energy": compute_energy_map(wav),
            "cadence": build_cadence_payload(words_payload),
        }
        path = scratch / "clip_analysis.json"
        path.write_text(json.dumps(bundle), encoding="utf-8")
        analysis = {
            "kind": "clip_analysis",
            "storageKey": hub.upload_file(
                job, "clip_analysis", str(path), "application/json"
            ),
            "filename": path.name,
            "mimeType": "application/json",
        }
    except Exception:
        # Never fatal. The transcript is the thing this job exists for, and
        # a sermon with words but no delivery measurements still clips —
        # the ranker simply judges it the way it did before this existed.
        logger.warning("could not measure the delivery", exc_info=True)

    hub.progress(job, 98, "Saving the transcript")
    return [
        {
            "kind": "transcript",
            # Which audio this is a transcript OF. Convex links the two and
            # refuses the write if the asset belongs to another project.
            "assetId": str(asset_id),
            "scope": "sermon",
            "language": info.language,
            "text": " ".join(words).strip(),
            # Serialised here rather than sent as a nested array: the segment
            # list for a forty-minute sermon is thousands of objects, and it
            # is only ever read back whole.
            "segmentsJson": json.dumps(collected),
        },
        *([analysis] if analysis else []),
    ]


@handles("youtube_import")
def youtube_import(hub: Hub, job: Job, scratch: Path) -> list[dict[str, object]]:
    """Pull a service recording down from YouTube."""
    payload = _payload(job)
    url = payload.get("sourceUrl")
    if not url:
        raise ValueError("No YouTube link to import")

    hub.progress(job, 10, "Downloading from YouTube")
    output = scratch / "source.mp4"
    _run(
        [
            "yt-dlp",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            "-o", str(output),
            str(url),
        ],
        job,
        hub,
    )
    if not output.exists():
        raise RuntimeError("The download finished but produced no file")

    hub.progress(job, 70, "Uploading the source")
    key = hub.upload_file(job, "source_video", str(output), "video/mp4")

    return [
        {
            "kind": "source_video",
            "storageKey": key,
            "filename": output.name,
            "mimeType": "video/mp4",
            "durationSeconds": _probe_duration(output),
        }
    ]


def probe_frame(target: str) -> tuple[int, int] | None:
    """The displayed size of a video, rotation already applied.

    Works on a URL as well as a path, so the clip cutter can ask about the
    master without downloading it.

    Reads the *display* dimensions rather than the coded ones. A phone films
    portrait and stores a landscape frame with a rotate tag, so trusting the
    coded size means treating a vertical video as horizontal — and then
    "cropping it to vertical" takes a narrow slice out of the middle of a
    frame that was already the right shape.
    """
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height:stream_side_data=rotation",
                "-of", "default=noprint_wrappers=1:nokey=1",
                target,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if out.returncode != 0:
            return None
        values = [v for v in out.stdout.split() if v]
        if len(values) < 2:
            return None
        width, height = int(values[0]), int(values[1])
        rotation = int(float(values[2])) if len(values) > 2 else 0
        if abs(rotation) % 180 == 90:
            width, height = height, width
        return width, height
    except (ValueError, OSError, subprocess.SubprocessError):
        return None
