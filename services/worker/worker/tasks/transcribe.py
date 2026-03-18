"""Transcription tasks using Faster-Whisper."""

from typing import Callable

from faster_whisper import WhisperModel


def transcribe_sermon(
    source_path: str,
    output_dir: str,
    model_size: str = "base",
    language: str = "en",
    progress_callback: Callable[[int, str], None] | None = None,
) -> dict:
    """
    Transcribe audio/video using Faster-Whisper.
    Returns dict with raw_text, segments, word_timestamps.
    """
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(source_path, language=language, word_timestamps=True)
    duration = float(getattr(info, "duration", 0.0) or 0.0)

    raw_parts = []
    segments_list = []
    word_timestamps_list = []
    last_progress = 10

    for seg in segments:
        raw_parts.append(seg.text)
        segments_list.append(
            {
                "start": seg.start,
                "end": seg.end,
                "text": seg.text,
            }
        )
        if seg.words:
            for w in seg.words:
                word_timestamps_list.append(
                    {
                        "word": w.word,
                        "start": w.start,
                        "end": w.end,
                    }
                )
        if progress_callback and duration > 0 and seg.end:
            ratio = max(0.0, min(float(seg.end) / duration, 1.0))
            progress = max(10, min(88, int(10 + ratio * 78)))
            if progress >= last_progress + 5:
                last_progress = progress
                progress_callback(progress, f"Transcribing... {int(ratio * 100)}% of audio")

    raw_text = " ".join(raw_parts).strip()
    if progress_callback:
        progress_callback(89, "Finalizing transcript...")

    return {
        "raw_text": raw_text,
        "cleaned_text": raw_text,  # MVP: no cleaning
        "language": info.language or language,
        "segments": segments_list,
        "word_timestamps": word_timestamps_list,
    }
