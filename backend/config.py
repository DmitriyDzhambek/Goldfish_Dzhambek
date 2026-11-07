"""Настройки приложения.

Все секреты читаются только на сервере. Значения по умолчанию позволяют
запустить проект вообще без ключей — в офлайн-режиме (этап 2+).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Ищем .env в корне проекта; в проде переменные приходят из окружения.
load_dotenv()


def _split(raw: str) -> tuple[str, ...]:
    return tuple(part.strip().rstrip("/") for part in raw.split(",") if part.strip())


@dataclass(frozen=True, slots=True)
class Settings:
    data_dir: str
    database_url: str | None
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    llm_fallback_base_url: str
    llm_fallback_api_key: str
    llm_fallback_model: str
    ollama_base_url: str
    ollama_model: str
    cors_origins: tuple[str, ...]
    rate_limit_per_minute: int
    session_secret: str
    public_base_url: str
    yandex_client_id: str
    yandex_client_secret: str
    yandex_redirect_uri: str

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir) / "store.json"

    @property
    def yandex_enabled(self) -> bool:
        return bool(self.yandex_client_id and self.yandex_client_secret)

    @property
    def secure_cookies(self) -> bool:
        return self.public_base_url.startswith("https://")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    try:
        rate_limit = int(os.getenv("RATE_LIMIT_PER_MINUTE", "30"))
    except ValueError:
        rate_limit = 30

    public_base_url = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:5500").rstrip("/")
    session_secret = (
        os.getenv("SESSION_SECRET")
        or os.getenv("MAGIC_LINK_SECRET")
        or "zr-dev-session-secret-change-me"
    )

    return Settings(
        data_dir=os.getenv("DATA_DIR", "backend/data"),
        database_url=os.getenv("DATABASE_URL") or None,
        llm_base_url=os.getenv("LLM_BASE_URL", ""),
        llm_api_key=os.getenv("LLM_API_KEY", ""),
        llm_model=os.getenv("LLM_MODEL", ""),
        llm_fallback_base_url=os.getenv("LLM_FALLBACK_BASE_URL", ""),
        llm_fallback_api_key=os.getenv("LLM_FALLBACK_API_KEY", ""),
        llm_fallback_model=os.getenv("LLM_FALLBACK_MODEL", ""),
        ollama_base_url=os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
        ollama_model=os.getenv("OLLAMA_MODEL", "qwen2.5:7b-instruct"),
        cors_origins=_split(
            os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,"
                "http://localhost:5500,http://127.0.0.1:5500",
            )
        ),
        rate_limit_per_minute=max(1, rate_limit),
        session_secret=session_secret,
        public_base_url=public_base_url,
        yandex_client_id=os.getenv("YANDEX_CLIENT_ID", ""),
        yandex_client_secret=os.getenv("YANDEX_CLIENT_SECRET", ""),
        yandex_redirect_uri=os.getenv(
            "YANDEX_REDIRECT_URI",
            f"{public_base_url}/api/auth/yandex/callback",
        ),
    )
