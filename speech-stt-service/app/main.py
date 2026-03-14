from __future__ import annotations

import logging
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile

from .config import Settings, get_settings
from .transcriber import get_model, transcribe_audio_file

app = FastAPI(title="StrawMoneyBook faster-whisper STT", version="1.0.0")


def require_api_key(
    x_stt_api_key: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = (settings.stt_api_key or "").strip()
    if not expected:
        return
    if (x_stt_api_key or "").strip() != expected:
        raise HTTPException(status_code=401, detail="invalid stt api key")


@app.on_event("startup")
def configure_logging() -> None:
    settings = get_settings()
    logging.basicConfig(level=getattr(logging, settings.faster_whisper_log_level.upper(), logging.INFO))


@app.get("/health")
def health(settings: Settings = Depends(get_settings), _auth: None = Depends(require_api_key)) -> dict[str, object]:
    return {
        "ok": True,
        "model_size": settings.faster_whisper_model_size,
        "device": settings.faster_whisper_device,
        "compute_type": settings.faster_whisper_compute_type,
        "download_root": settings.faster_whisper_download_root,
        "model_loaded": get_model.cache_info().currsize > 0,
    }


@app.post("/v1/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: str | None = Form(default=None),
    _auth: None = Depends(require_api_key),
) -> dict[str, object]:
    suffix = Path(audio.filename or "voice-input.webm").suffix or ".webm"
    with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        temp_path = Path(temp_file.name)
        while True:
            chunk = await audio.read(1024 * 1024)
            if not chunk:
                break
            temp_file.write(chunk)

    try:
        result = transcribe_audio_file(str(temp_path), language=language)
        return result
    finally:
        try:
            temp_path.unlink(missing_ok=True)
        except OSError:
            pass
