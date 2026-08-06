"""Whether a source can be read over HTTP instead of downloaded whole.

A service recording is around twelve gigabytes and the sermon is a forty
minute slice of it. Downloading all of it to keep a third was the only option
while nothing knew where the file's index was — and the answer is in the
first few bytes, so it was never expensive to ask.

Getting this wrong in one direction costs a slow job. Getting it wrong in the
other costs a broken one: claiming an unseekable file is seekable makes
ffmpeg read the entire thing over the network with no local copy to show for
it. So every uncertain case here answers "download it".
"""

from __future__ import annotations

from worker.jobs import _moov_before_mdat


def box(kind: bytes, payload_len: int = 0) -> bytes:
    """A top-level MP4 box: 4-byte size, 4-byte type, then payload."""
    return (8 + payload_len).to_bytes(4, "big") + kind + (b"\0" * payload_len)


def large_box(kind: bytes, payload_len: int = 0) -> bytes:
    """The 64-bit form: size 1, then the real size after the type."""
    return (
        (1).to_bytes(4, "big")
        + kind
        + (16 + payload_len).to_bytes(8, "big")
        + (b"\0" * payload_len)
    )


def reader(data: bytes):
    def read_at(offset: int, length: int) -> bytes:
        return data[offset : offset + length]

    return read_at


def test_index_at_the_front_is_streamable():
    data = box(b"ftyp", 24) + box(b"moov", 400) + box(b"mdat", 5000)
    assert _moov_before_mdat(reader(data)) is True


def test_index_at_the_end_is_not():
    # The common camera/recorder layout, and the reason the download path has
    # to stay: ffmpeg would read all of mdat looking for the index.
    data = box(b"ftyp", 24) + box(b"mdat", 5000) + box(b"moov", 400)
    assert _moov_before_mdat(reader(data)) is False


def test_walks_past_boxes_it_does_not_care_about():
    data = (
        box(b"ftyp", 24)
        + box(b"free", 128)
        + box(b"skip", 64)
        + box(b"moov", 400)
        + box(b"mdat", 5000)
    )
    assert _moov_before_mdat(reader(data)) is True


def test_handles_the_64_bit_size_form():
    data = large_box(b"free", 200) + box(b"moov", 100) + box(b"mdat", 900)
    assert _moov_before_mdat(reader(data)) is True


def test_size_zero_runs_to_eof_so_nothing_follows():
    data = (0).to_bytes(4, "big") + b"free" + (b"\0" * 64)
    assert _moov_before_mdat(reader(data)) is False


def test_refuses_a_nonsense_size_rather_than_looping():
    # A size below the 8-byte header would never advance the offset.
    data = (2).to_bytes(4, "big") + b"free" + (b"\0" * 64)
    assert _moov_before_mdat(reader(data)) is False


def test_gives_up_on_a_file_that_is_all_padding():
    # Sixteen boxes and still no moov: stop asking rather than walk a whole
    # file sixteen bytes at a time.
    data = b"".join(box(b"free", 8) for _ in range(40))
    assert _moov_before_mdat(reader(data)) is False


def test_truncated_header_is_not_streamable():
    assert _moov_before_mdat(reader(b"\0\0")) is False
    assert _moov_before_mdat(reader(b"")) is False


def test_stops_at_the_end_of_the_file_when_size_is_known():
    data = box(b"ftyp", 24)
    assert _moov_before_mdat(reader(data), file_size=len(data)) is False
