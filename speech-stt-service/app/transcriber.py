from __future__ import annotations

from functools import lru_cache
from threading import Lock
from typing import Any

from faster_whisper import WhisperModel

from .config import get_settings

_model_lock = Lock()


@lru_cache(maxsize=1)
def get_model() -> WhisperModel:
    settings = get_settings()
    with _model_lock:
        return WhisperModel(
            settings.faster_whisper_model_size,
            device=settings.faster_whisper_device,
            compute_type=settings.faster_whisper_compute_type,
            download_root=settings.faster_whisper_download_root,
            cpu_threads=settings.faster_whisper_cpu_threads,
            num_workers=settings.faster_whisper_num_workers,
        )


def transcribe_audio_file(audio_path: str, language: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    model = get_model()
    segments, info = model.transcribe(
        audio_path,
        language=(language or settings.faster_whisper_language or None),
        beam_size=settings.faster_whisper_beam_size,
        best_of=settings.faster_whisper_best_of,
        vad_filter=settings.faster_whisper_vad_filter,
        vad_parameters={"min_silence_duration_ms": settings.faster_whisper_vad_min_silence_ms},
        condition_on_previous_text=settings.faster_whisper_condition_on_previous_text,
        word_timestamps=settings.faster_whisper_word_timestamps,
        temperature=settings.faster_whisper_temperature,
    )

    rendered_segments: list[dict[str, Any]] = []
    combined_text: list[str] = []
    avg_logprob_sum = 0.0
    no_speech_sum = 0.0

    for index, segment in enumerate(segments):
        segment_text = (segment.text or "").strip()
        if segment_text:
            combined_text.append(segment_text)
        avg_logprob = float(getattr(segment, "avg_logprob", 0.0) or 0.0)
        no_speech_prob = float(getattr(segment, "no_speech_prob", 0.0) or 0.0)
        avg_logprob_sum += avg_logprob
        no_speech_sum += no_speech_prob
        rendered_segments.append(
            {
                "id": index,
                "start": round(float(segment.start) * 1000),
                "end": round(float(segment.end) * 1000),
                "text": segment_text,
                "avg_logprob": avg_logprob,
                "no_speech_prob": no_speech_prob,
                "compression_ratio": float(getattr(segment, "compression_ratio", 0.0) or 0.0),
            }
        )

    segment_count = len(rendered_segments) or 1
    duration_ms = round(float((getattr(info, "duration", 0.0) or 0.0)) * 1000)

    return {
        "text": " ".join(combined_text).strip(),
        "language": getattr(info, "language", language or settings.faster_whisper_language),
        "language_probability": float(getattr(info, "language_probability", 0.0) or 0.0),
        "duration_ms": duration_ms,
        "avg_logprob": avg_logprob_sum / segment_count,
        "no_speech_prob": no_speech_sum / segment_count,
        "segments": rendered_segments,
    }
