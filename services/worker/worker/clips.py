"""Cutting a clip out of the sermon.

A clip is a slice of the master and nothing else: same frame, same codec,
same pixels, just shorter. The streams are copied, so the cut is lossless
and takes seconds rather than minutes.

It used to crop to 9:16 and re-encode, on the theory that the platforms
these go to are vertical. They are, but reframing a sermon is an editorial
decision — which of three people on a stage the shot should follow — and a
centre crop guesses at it, badly, while throwing away two thirds of the
width and every pixel of quality along with it. The reframing belongs in an
editor, where somebody can see what they are doing. This just gets them the
right thirty seconds to work with.

The one cost of copying is that a cut can only land on a keyframe, so the
start moves to the nearest one before the mark — a second or two early on a
typical stream. Early is the right direction: it keeps the whole hook and
adds a beat of run-up, where late would clip the first word.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from worker.hub import Hub, Job
from worker.jobs import _download, _payload, _probe_duration, _run, probe_frame
from worker.loop import handles

logger = logging.getLogger(__name__)

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
            # -ss before -i seeks by index rather than decoding up to the
            # mark, which on a forty-minute master is the difference between
            # a second and a minute.
            "-ss", str(start),
            "-i", url,
            "-t", str(end - start),
            # No filter and no encoder: the streams are copied straight
            # across, so the clip is the sermon's own pixels and the whole
            # cut costs seconds.
            "-c", "copy",
            # A copied cut can start on a negative timestamp when the seek
            # lands mid-GOP; without this some players open on a frozen
            # frame or refuse the file outright.
            "-avoid_negative_ts", "make_zero",
            # Index at the front, so the file plays while it downloads
            # rather than after.
            "-movflags", "+faststart",
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
    }
    # Measured, not assumed. This used to record 1080x1920 on every clip
    # whatever the file turned out to be, so a copied vertical clip claimed
    # dimensions it did not have and nothing downstream could tell.
    made = probe_frame(str(scratch / name))
    if made:
        asset["width"], asset["height"] = made[0], made[1]
    # Carried through so Convex can link the file back to the suggestion that
    # produced it. Without it the clip exists and nothing knows why.
    if clip_id:
        asset["clipId"] = str(clip_id)
    return [asset]
