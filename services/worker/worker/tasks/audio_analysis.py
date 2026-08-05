"""How the sermon was said, measured off the audio and the word timings.

Carried over from the FastAPI service's caption_video.py, where these ran for
months and their thresholds were arrived at by watching output. Copied rather
than reimplemented on purpose: a re-derivation that disagreed by a little
would make the Clip Lab quietly worse in ways nobody could name.

Two producers:

  energy   RMS and peak per 100ms frame, straight off the waveform. Says
           where the preacher got loud and where the room went quiet.
  cadence  Phrases split on held pauses and full stops, with the markers the
           Clip Lab's whole vocabulary is built on — Punch Phrase, Rising
           Stack, Repetition, Pause Punch. Needs no audio at all; word
           timings carry it.

Both run on the worker because the first one decodes a two-gigabyte file, and
because ffmpeg and numpy already live here.
"""

from __future__ import annotations

import math
import re
import subprocess
import wave
from pathlib import Path

import numpy as np


def extract_wav(video_path: Path, out_path: Path, sample_rate: int = 16000) -> Path:
    """A mono 16-bit PCM WAV, which is what compute_energy_map expects."""
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-i",
            str(video_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            str(sample_rate),
            "-acodec",
            "pcm_s16le",
            str(out_path),
        ],
        check=True,
        capture_output=True,
    )
    return out_path


def compute_energy_map(
    wav_path: Path, window_sec: float = 0.1, hop_sec: float = 0.1
) -> dict:
    with wave.open(str(wav_path), "rb") as wf:
        sample_rate = wf.getframerate()
        sample_width = wf.getsampwidth()
        channels = wf.getnchannels()
        n_frames = wf.getnframes()
        pcm = wf.readframes(n_frames)

    if sample_width != 2:
        raise RuntimeError("Expected 16-bit PCM WAV from ffmpeg extraction.")

    samples = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    if samples.size == 0:
        return {"window_sec": window_sec, "hop_sec": hop_sec, "frames": []}

    frame_size = max(1, int(round(window_sec * sample_rate)))
    hop_size = max(1, int(round(hop_sec * sample_rate)))
    eps = 1e-12
    max_i16 = 32768.0
    out = []
    i = 0
    while i < samples.size:
        frame = samples[i : i + frame_size]
        if frame.size == 0:
            break
        norm = frame / max_i16
        rms = float(np.sqrt(np.mean(norm * norm)))
        peak = float(np.max(np.abs(norm)))
        rms_db = 20.0 * math.log10(max(rms, eps))
        peak_db = 20.0 * math.log10(max(peak, eps))
        out.append(
            {
                "t": round(i / sample_rate, 3),
                "rms_db": round(rms_db, 1),
                "peak_db": round(peak_db, 1),
            }
        )
        i += hop_size

    return {"window_sec": window_sec, "hop_sec": hop_sec, "frames": out}


def _normalize_0_100(value: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (value - lo) / (hi - lo)))


def build_cadence_payload(
    words_payload: dict, pause_threshold_sec: float = 0.3
) -> dict:
    words = words_payload.get("words", [])
    if not words:
        return {"phrases": []}

    phrases = []
    current = [words[0]]
    for prev, nxt in zip(words, words[1:]):
        gap = float(nxt["s"]) - float(prev["e"])
        hard_stop = str(prev["w"]).strip().endswith((".", "!", "?"))
        if gap > pause_threshold_sec or hard_stop:
            phrases.append(current)
            current = [nxt]
        else:
            current.append(nxt)
    if current:
        phrases.append(current)

    cadence_phrases = []
    prev_wps = None
    for phrase in phrases:
        start = float(phrase[0]["s"])
        end = float(phrase[-1]["e"])
        duration = max(0.001, end - start)
        phrase_words = [w["w"] for w in phrase]
        text = " ".join(t.strip() for t in phrase_words if t.strip())
        word_count = len(phrase_words)
        wps = word_count / duration

        pauses_ms = []
        for a, b in zip(phrase, phrase[1:]):
            gap = max(0.0, float(b["s"]) - float(a["e"]))
            pauses_ms.append(gap * 1000.0)
        avg_pause_ms = sum(pauses_ms) / len(pauses_ms) if pauses_ms else 0.0
        max_pause_ms = max(pauses_ms) if pauses_ms else 0.0

        markers = []
        lowered_tokens = [re.sub(r"[^\w']", "", t.lower()) for t in phrase_words]
        lowered_tokens = [t for t in lowered_tokens if t]
        repeated = any(lowered_tokens.count(t) >= 2 for t in set(lowered_tokens))
        if repeated:
            markers.append("repetition")
        if sum(1 for t in phrase_words if t.strip().endswith((".", "!", "?"))) >= 2:
            markers.append("stacked_statements")
        if max_pause_ms >= 350:
            markers.append("pause_punch")
        if prev_wps is not None:
            if wps - prev_wps >= 0.9:
                markers.append("pace_shift_fast")
            elif prev_wps - wps >= 0.9:
                markers.append("pace_shift_slow")
        if prev_wps is not None and wps > prev_wps:
            markers.append("rising_intensity")

        score = (
            _normalize_0_100(wps, 1.0, 5.0) * 0.45
            + _normalize_0_100(max_pause_ms, 0, 650) * 0.25
            + min(30.0, len(markers) * 8.0)
        )
        cadence_score = int(round(max(0.0, min(100.0, score))))

        cadence_phrases.append(
            {
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
                "word_count": word_count,
                "words_per_sec": round(wps, 2),
                "avg_pause_ms": int(round(avg_pause_ms)),
                "max_pause_ms": int(round(max_pause_ms)),
                "markers": markers,
                "cadence_score": cadence_score,
            }
        )
        prev_wps = wps

    return {"phrases": cadence_phrases}
