#!/usr/bin/env python3
"""Which Whisper model should this box run?

Run it on the machine that will do the work, against real sermon audio.
Model choice is a trade between speed, memory, and how much of the sermon
comes back wrong — and the third one is the reason not to just pick the
fastest. A misheard scripture reference ends up in a blog post published
under the church's name.

    python bench_whisper.py sermon.mp4
    python bench_whisper.py sermon.mp4 --models small,medium,large-v3

Prints a table, and — when more than one model ran — where they disagree,
because that is the part a speed number cannot tell you.
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

DEFAULT_MODELS = ["small", "medium", "large-v3"]

# Words worth checking by eye when comparing two transcripts. A model that is
# a little slower but gets these right is the cheaper model in the end.
NAMES = re.compile(
    r"\b(?:Jesus|Christ|God|Lord|Spirit|Nehemiah|Sanballat|Tobiah|Corinth\w*|"
    r"Thessalon\w*|Habakkuk|Zephaniah|Deuteronomy|Ecclesiastes|Philipp\w*)\b",
    re.I,
)


def extract_audio(source: Path, into: Path) -> tuple[Path, float]:
    """Mono 16 kHz WAV, and how long it is.

    Done once and reused for every model, so the numbers compare the models
    rather than the decode.
    """
    audio = into / "audio.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(source), "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", str(audio)],
        check=True, capture_output=True,
    )
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(audio)],
        capture_output=True, text=True, check=True,
    )
    return audio, float(probe.stdout.strip())


def run_model(name: str, audio: Path, device: str, compute_type: str) -> dict:
    from faster_whisper import WhisperModel

    load_started = time.monotonic()
    model = WhisperModel(name, device=device, compute_type=compute_type)
    load_seconds = time.monotonic() - load_started

    # Twice, and only the second one counts.
    #
    # The first model to run on a cold GPU pays for CUDA context creation and
    # cuDNN autotuning on behalf of the whole benchmark — enough to make
    # `small` look five times slower than `medium`, which is nonsense. Whoever
    # goes first would otherwise be punished for going first.
    seconds = 0.0
    text = ""
    for run in range(2):
        started = time.monotonic()
        segments, _info = model.transcribe(str(audio), vad_filter=True)
        # faster-whisper is lazy: the work happens as the generator is
        # consumed, so the timer must wrap the consumption, not the call.
        text = " ".join(s.text.strip() for s in segments)
        seconds = time.monotonic() - started

    peak_mb = None
    try:
        import resource  # POSIX only; this box is Linux

        peak_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    except Exception:
        pass

    del model
    return {
        "model": name,
        "load_seconds": load_seconds,
        "seconds": seconds,
        "text": text,
        "words": len(text.split()),
        "peak_mb": peak_mb,
    }


def disagreements(a: dict, b: dict, limit: int = 12) -> list[str]:
    """Where two transcripts differ, in words rather than characters."""
    diff = difflib.SequenceMatcher(None, a["text"].split(), b["text"].split())
    out: list[str] = []
    for tag, i1, i2, j1, j2 in diff.get_opcodes():
        if tag == "equal":
            continue
        left = " ".join(a["text"].split()[i1:i2]) or "—"
        right = " ".join(b["text"].split()[j1:j2]) or "—"
        # Only the interesting ones. Single-word filler differences are
        # noise; a changed proper noun is the whole point.
        if NAMES.search(left) or NAMES.search(right) or len(left.split()) > 3:
            out.append(f"  {a['model']:>8}: …{left}…\n  {b['model']:>8}: …{right}…")
        if len(out) >= limit:
            break
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="A real sermon file")
    parser.add_argument("--models", default=",".join(DEFAULT_MODELS))
    parser.add_argument("--device", default="auto", help="auto | cuda | cpu")
    parser.add_argument(
        "--compute-type",
        default="auto",
        help="auto | float16 (GPU) | int8 (CPU). float16 is the usual GPU choice.",
    )
    args = parser.parse_args()

    if not args.source.exists():
        print(f"No such file: {args.source}", file=sys.stderr)
        return 1

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    print(f"cores: {os.cpu_count()}  device: {args.device}  "
          f"compute: {args.compute_type}")

    with tempfile.TemporaryDirectory(prefix="bench-") as scratch:
        print("extracting audio…")
        audio, duration = extract_audio(args.source, Path(scratch))
        print(f"audio: {duration / 60:.1f} min\n")

        results = []
        for name in models:
            print(f"running {name}… ", end="", flush=True)
            try:
                r = run_model(name, audio, args.device, args.compute_type)
            except Exception as exc:
                print(f"failed: {exc}")
                continue
            results.append(r)
            print(f"{r['seconds']:.1f}s")

        if not results:
            return 1

        print(f"\n{'model':>10} {'transcribe':>11} {'load':>7} {'×realtime':>10} "
              f"{'words':>7} {'host RAM':>14}")
        print("-" * 68)
        for r in results:
            # The number that decides whether a queue keeps up: a 40-minute
            # sermon at 20× realtime is two minutes of work.
            realtime = duration / r["seconds"] if r["seconds"] else 0
            ram = f"{r['peak_mb']:.0f} MB" if r["peak_mb"] else "—"
            print(f"{r['model']:>10} {r['seconds']:>10.1f}s {r['load_seconds']:>6.1f}s "
                  f"{realtime:>9.1f}× {r['words']:>7} {ram:>14}")

        print("\nAt this rate a 40-minute sermon takes:")
        for r in results:
            realtime = duration / r["seconds"] if r["seconds"] else 0
            if realtime:
                print(f"  {r['model']:>10}  {40 * 60 / realtime / 60:.1f} min")

        for i in range(len(results) - 1):
            a, b = results[i], results[i + 1]
            diffs = disagreements(a, b)
            if diffs:
                print(f"\nWhere {a['model']} and {b['model']} disagree "
                      f"(names and long runs only):")
                print("\n\n".join(diffs))

        print("\nSpeed is the easy half. Read the disagreements above: if the "
              "\nsmaller model is mangling scripture references or names, it is "
              "\nnot the cheaper choice — that text gets published.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
