"""Pulling a listenable mp3 out of the sermon master.

The master is video — around two gigabytes of it — and nothing in the system
has ever stored the audio on its own. Study wants to play a sermon on a phone,
which is not something you do by downloading the video.

The command is the thing worth pinning. Mono at 128kbps is Alex's call: more
than speech strictly needs, so a preacher who drops to a near-whisper still
comes through. Getting -vn wrong silently ships a video file with an .mp3 name.
"""

from __future__ import annotations

import subprocess
from pathlib import Path
from unittest.mock import patch

from worker.jobs import sermon_audio

# _source_streams_over_http issues a real ranged httpx request. Left alone it
# would reach for s3.example, fail, fall back to the download path, and die in
# a fake that has no _download — a network-dependent test failing for a reason
# that has nothing to do with what it asserts. Every test here pins it.
STREAMS = "worker.jobs._source_streams_over_http"


class FakeHub:
    def __init__(self):
        self.uploaded = []
        self.progress_calls = []

    def download_url(self, job, asset_id):
        return (f"https://s3.example/{asset_id}.mp4", {})

    def progress(self, job, percent, message):
        self.progress_calls.append((percent, message))

    def log(self, job, message, **kwargs):
        # _run calls this with level="error" on a non-zero exit. A fake that
        # takes only two arguments turns an ffmpeg failure into a TypeError
        # and hides what actually went wrong.
        pass

    def upload_file(self, job, kind, path, mime):
        self.uploaded.append((kind, path, mime))
        return f"Amplify/c/p/{kind}/sermon-audio.mp3"


class FakeJob:
    job_id = "j1"
    project_id = "p1"
    church_id = "c1"
    job_type = "sermon_audio"
    subject_id = None
    payload_json = '{"assetId": "a1"}'
    attempt = 0


def fake_run(recorder):
    def run(cmd, *_args, **_kwargs):
        recorder.append(cmd)
        return subprocess.CompletedProcess(cmd, 0, stdout="2400.0", stderr="")

    return run


def test_extracts_mono_128k_mp3(tmp_path: Path):
    cmds = []
    hub = FakeHub()
    with patch(STREAMS, return_value=True), patch("subprocess.run", fake_run(cmds)):
        result = sermon_audio(hub, FakeJob(), tmp_path)

    ffmpeg = next(c for c in cmds if c[0] == "ffmpeg")
    assert "-vn" in ffmpeg, "without -vn this is a video file called .mp3"
    assert ffmpeg[ffmpeg.index("-ac") + 1] == "1"
    assert ffmpeg[ffmpeg.index("-b:a") + 1] == "128k"
    assert ffmpeg[ffmpeg.index("-c:a") + 1] == "libmp3lame"

    assert result[0]["kind"] == "sermon_audio"
    assert result[0]["mimeType"] == "audio/mpeg"


def test_uploads_under_the_sermon_audio_kind(tmp_path: Path):
    hub = FakeHub()
    with patch(STREAMS, return_value=True), patch("subprocess.run", fake_run([])):
        sermon_audio(hub, FakeJob(), tmp_path)

    kind, _, mime = hub.uploaded[0]
    assert kind == "sermon_audio"
    assert mime == "audio/mpeg"


def test_carries_the_duration_so_a_player_can_draw_its_scrubber(tmp_path: Path):
    hub = FakeHub()
    with patch(STREAMS, return_value=True), patch("subprocess.run", fake_run([])):
        result = sermon_audio(hub, FakeJob(), tmp_path)

    assert result[0]["durationSeconds"] == 2400.0


def test_streams_the_master_rather_than_downloading_two_gigabytes(tmp_path: Path):
    # trim writes the master with +faststart precisely so this is possible.
    # Falling back to a download still works, but it puts 2GB on a scratch
    # disk to throw the video away.
    cmds = []
    hub = FakeHub()
    with patch(STREAMS, return_value=True), patch("subprocess.run", fake_run(cmds)):
        sermon_audio(hub, FakeJob(), tmp_path)

    ffmpeg = next(c for c in cmds if c[0] == "ffmpeg")
    assert "https://s3.example/a1.mp4" in ffmpeg
    # The http-only options must be present when the input really is a URL.
    assert "-reconnect" in ffmpeg


def test_REFUSES_A_JOB_WITH_NO_SOURCE(tmp_path: Path):
    # Without an asset id there is nothing to read. Failing here is a job that
    # retries and then reports; guessing a source would extract the wrong
    # sermon and record it as this one's.
    class NoAsset(FakeJob):
        payload_json = "{}"
        subject_id = None

    hub = FakeHub()
    try:
        sermon_audio(hub, NoAsset(), tmp_path)
    except ValueError:
        return
    raise AssertionError("expected a ValueError")
