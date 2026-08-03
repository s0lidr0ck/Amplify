"""Cutting a clip out of the sermon.

Separate from jobs.py because this one re-encodes, and everything about it
follows from that. A trim is a slice of an existing file and copies streams;
a clip changes the frame, so every pixel is new.

Vertical, because the platforms these go to are vertical. A 16:9 sermon
cropped to 9:16 loses two thirds of its width, so the crop has to be chosen
rather than taken from the middle: on a locked-off sermon camera the preacher
is rarely centred, and centre-cropping cuts a pulpit in half about as often
as it works.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from worker.hub import Hub, Job
from worker.jobs import _download, _payload, _probe_duration, _run
from worker.loop import handles

logger = logging.getLogger(__name__)

#: 1080x1920. The platforms accept more, but nothing gains from it — the
#: source is a 1080p sermon camera, so anything larger is upscaled nothing.
WIDTH, HEIGHT = 1080, 1920


def _crop_filter(focus: str) -> str:
    """Where in the 16:9 frame the 9:16 window sits.

    Expressed as a fraction of the leftover width so it holds whatever the
    source resolution turns out to be — hard-coding pixel offsets breaks the
    day somebody uploads 4K.
    """
    x = {
        "left": "0",
        "centre": "(iw-ow)/2",
        "center": "(iw-ow)/2",
        "right": "iw-ow",
    }.get(focus, "(iw-ow)/2")

    return (
        # Crop to 9:16 at full height, then scale to the target. Cropping
        # before scaling keeps the sharpest pixels: the other order scales
        # the whole frame and throws most of it away afterwards.
        f"crop=ih*9/16:ih:{x}:0,"
        f"scale={WIDTH}:{HEIGHT}:flags=lanczos,"
        f"setsar=1"
    )


@handles("clip_export")
def clip_export(hub: Hub, job: Job, scratch: Path) -> list[dict[str, object]]:
    """Cut one clip and upload it."""
    payload = _payload(job)
    asset_id = payload.get("assetId") or job.subject_id
    clip_id = payload.get("clipId")
    if not asset_id:
        raise ValueError("No video to cut the clip from")

    start = float(payload.get("startSeconds", 0))
    end = float(payload.get("endSeconds", 0))
    if end <= start:
        raise ValueError("The end of a clip must come after its start")

    focus = str(payload.get("focus", "centre"))

    # Read straight from S3 rather than downloading first.
    #
    # The first version pulled the whole master down — 22 seconds for a
    # 39-minute sermon, to cut 35 seconds out of it, and eight clips meant
    # eight identical downloads. ffmpeg speaks HTTP and S3 serves ranges, so
    # with -ss before -i it fetches the index, jumps to the byte offset it
    # wants, and reads only the part it needs.
    #
    # This depends on the master having its index at the FRONT, which is why
    # the trim writes +faststart. Without that the index is at the end of the
    # file and ffmpeg has to read the whole thing to find it, quietly putting
    # the download back.
    hub.progress(job, 5, "Reading the sermon")
    url, _ = hub.download_url(job, str(asset_id))

    hub.progress(job, 25, "Cutting")
    output = scratch / "clip.mp4"
    _run(
        [
            "ffmpeg", "-y",
            # Keep trying if the connection wobbles: a stream that dies
            # halfway leaves a truncated clip rather than an error.
            "-reconnect", "1", "-reconnect_streamed", "1",
            "-reconnect_delay_max", "5",
            # -ss before -i seeks by index; the extra -ss after would be
            # frame-accurate but decodes from the last keyframe every time,
            # and on a forty-minute file that is minutes per clip.
            "-ss", str(start),
            "-i", url,
            "-t", str(end - start),
            "-vf", _crop_filter(focus),
            # Re-encoding is unavoidable here, so the settings are chosen
            # rather than defaulted: veryfast keeps a batch of eight clips
            # to minutes, and CRF 20 is visually clean at this size.
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            # Faststart puts the index at the front so the file plays while
            # it downloads. Without it a phone waits for the whole thing.
            "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "128k", "-ac", "2",
            str(output),
        ],
        job,
        hub,
    )

    if not output.exists() or output.stat().st_size == 0:
        raise RuntimeError("ffmpeg finished but produced no clip")

    hub.progress(job, 75, "Uploading the clip")
    name = f"clip-{int(start)}-{int(end)}.mp4"
    key = hub.upload_file(job, "clip", str(output.rename(scratch / name)), "video/mp4")

    asset: dict[str, object] = {
        "kind": "clip",
        "storageKey": key,
        "filename": name,
        "mimeType": "video/mp4",
        "durationSeconds": _probe_duration(scratch / name) or (end - start),
        "width": WIDTH,
        "height": HEIGHT,
    }
    # Carried through so Convex can link the file back to the suggestion that
    # produced it. Without it the clip exists and nothing knows why.
    if clip_id:
        asset["clipId"] = str(clip_id)
    return [asset]
