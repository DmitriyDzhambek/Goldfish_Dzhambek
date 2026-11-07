"""«Золотая рыбка» — FastAPI-приложение.

Запуск из корня репозитория:
    uvicorn backend.main:app --reload --port 8000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.config import get_settings
from backend.errors import (
    ApiError,
    api_error_handler,
    http_error_handler,
    validation_error_handler,
)
from backend.routers import auth, chat, memory, wishes

APP_VERSION = "0.2.0"


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Золотая рыбка API",
        description=(
            "Бесплатный и безлимитный ИИ-ассистент: желание → план → исполнение. "
            "Ни тарифов, ни paywall, ни счётчиков желаний."
        ),
        version=APP_VERSION,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
        redoc_url=None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins) or ["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.add_exception_handler(ApiError, api_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_error_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)

    app.include_router(chat.router, prefix="/api")
    app.include_router(wishes.router, prefix="/api")
    app.include_router(memory.router, prefix="/api")
    app.include_router(auth.router, prefix="/api")

    @app.get("/api/health", tags=["system"], summary="Живо ли море")
    async def health() -> dict[str, object]:
        return {
            "status": "ok",
            "version": APP_VERSION,
            "free": True,
            "limits": "unlimited",
        }

    return app


app = create_app()
