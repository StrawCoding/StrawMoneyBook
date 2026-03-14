from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    faster_whisper_model_size: str = "large-v3"
    faster_whisper_device: str = "cpu"
    faster_whisper_compute_type: str = "int8"
    faster_whisper_download_root: str = "/models"
    faster_whisper_cpu_threads: int = 4
    faster_whisper_num_workers: int = 1
    faster_whisper_beam_size: int = 5
    faster_whisper_best_of: int = 5
    faster_whisper_language: str = "zh"
    faster_whisper_vad_filter: bool = True
    faster_whisper_vad_min_silence_ms: int = 450
    faster_whisper_condition_on_previous_text: bool = False
    faster_whisper_word_timestamps: bool = False
    faster_whisper_temperature: float = 0.0
    faster_whisper_log_level: str = "INFO"
    stt_port: int = 8001
    stt_api_key: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
