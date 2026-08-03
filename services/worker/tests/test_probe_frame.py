"""What shape a video actually is, as opposed to what it says it is.

The whole clip cutter turns on this: a source that is already vertical gets
copied, and one that is not gets reframed. Reading it wrong means either
re-encoding a file for nothing, or taking a narrow slice out of the middle
of a frame that was already the right shape.
"""

from __future__ import annotations

import subprocess
from unittest.mock import patch

from worker.jobs import probe_frame


def fake_ffprobe(stdout: str, returncode: int = 0):
    def run(*_args, **_kwargs):
        return subprocess.CompletedProcess([], returncode, stdout=stdout, stderr="")
    return run


def test_reads_a_plain_landscape_frame():
    with patch("subprocess.run", fake_ffprobe("1920\n1080\n")):
        assert probe_frame("x.mp4") == (1920, 1080)


def test_reads_a_plain_portrait_frame():
    with patch("subprocess.run", fake_ffprobe("1080\n1920\n")):
        assert probe_frame("x.mp4") == (1080, 1920)


def test_applies_rotation_so_a_phone_video_reads_as_portrait():
    # The case that matters. A phone films portrait and stores a landscape
    # frame with a rotate tag; trusting the coded size would call this
    # horizontal and crop a narrow strip out of the middle of it.
    with patch("subprocess.run", fake_ffprobe("1920\n1080\n-90\n")):
        assert probe_frame("x.mp4") == (1080, 1920)


def test_ignores_a_half_turn():
    # 180 is upside down, not sideways. Swapping here would invent a
    # portrait video out of a landscape one.
    with patch("subprocess.run", fake_ffprobe("1920\n1080\n180\n")):
        assert probe_frame("x.mp4") == (1920, 1080)


def test_returns_none_rather_than_guessing():
    # An unreadable probe must not silently become "landscape", which would
    # None means "don't know", and the cutter reads that as "reframe" — the
    # slow answer, but the one that always yields a 9:16 file. Guessing
    # "already vertical" would hand back a landscape reel instead.
    with patch("subprocess.run", fake_ffprobe("", returncode=1)):
        assert probe_frame("x.mp4") is None
    with patch("subprocess.run", fake_ffprobe("1920\n")):
        assert probe_frame("x.mp4") is None
