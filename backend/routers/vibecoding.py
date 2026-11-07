"""Вайбкодинг: задача обычным текстом → план и предложения по коду."""

from __future__ import annotations

from fastapi import APIRouter, Request

from backend.config import get_settings
from backend.errors import ApiError
from backend.ratelimit import get_limiter
from backend.schemas import ErrorResponse, VibeRequest, VibeResponse
from backend.vibecoding import analyze

router = APIRouter(prefix="/vibecoding", tags=["vibecoding"])

_RATE_LIMIT_MESSAGE = (
    "Слишком много запросов на анализ. Подожди минуту и попробуй снова."
)


@router.post(
    "/analyze",
    response_model=VibeResponse,
    summary="Разобрать задачу по коду проекта",
    responses={
        429: {"model": ErrorResponse, "description": "Слишком много запросов"},
    },
)
async def analyze_project(payload: VibeRequest, request: Request) -> VibeResponse:
    client_key = request.client.host if request.client else "unknown"
    if not get_limiter().allow(client_key):
        raise ApiError(429, "rate_limited", _RATE_LIMIT_MESSAGE)

    return await analyze(payload, get_settings())
