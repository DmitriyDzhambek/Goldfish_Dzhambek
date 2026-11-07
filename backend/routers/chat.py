"""POST /api/chat — SSE-стриминг ответа.

Контракт зафиксирован сейчас, реализация — этап 2:
  data: {"delta": "..."}
  data: {"done": true, "usage": {...}}
"""

from __future__ import annotations

from fastapi import APIRouter

from backend.errors import ApiError
from backend.schemas import ChatRequest, ErrorResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post(
    "",
    summary="Потоковый ответ рыбки (SSE)",
    responses={501: {"model": ErrorResponse, "description": "Ещё не реализовано"}},
)
async def chat(_: ChatRequest) -> None:
    raise ApiError(
        501,
        "not_implemented",
        "Чат появится на этапе 2: SSE-стриминг и цепочка моделей с fallback.",
    )
