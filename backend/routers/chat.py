"""POST /api/chat — потоковый ответ рыбки через SSE.

События:
    data: {"notice": "..."}                       # смена провайдера
    data: {"delta": "..."}                        # кусок текста
    data: {"done": true, "provider": "...", ...}  # конец ответа
    data: {"error": {"code": "...", "message": "..."}}
    data: [DONE]

История хранится на сервере по sessionId, поэтому клиент может перезагрузить
страницу и продолжить тот же диалог.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from backend.chat_history import ChatHistory
from backend.config import get_settings
from backend.errors import ApiError
from backend.llm import build_messages, build_system_prompt
from backend.providers import stream_with_fallback
from backend.ratelimit import get_limiter
from backend.schemas import ChatRequest, ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

_RATE_LIMIT_MESSAGE = "Слишком много сообщений подряд. Переведи дыхание и попробуй через минуту."


def _sse(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"


@router.post(
    "",
    summary="Потоковый ответ рыбки (SSE)",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"text/event-stream": {}}, "description": "SSE-поток"},
        429: {"model": ErrorResponse, "description": "Слишком много запросов"},
    },
)
async def chat(payload: ChatRequest, request: Request) -> StreamingResponse:
    client_key = request.client.host if request.client else "unknown"
    if not get_limiter().allow(client_key):
        raise ApiError(429, "rate_limited", _RATE_LIMIT_MESSAGE)

    settings = get_settings()
    history = ChatHistory()

    previous = history.get(payload.session_id)
    history.append(payload.session_id, "user", payload.message)

    system_prompt = build_system_prompt(character=payload.character)
    messages = build_messages(
        system_prompt=system_prompt,
        history=previous,
        user_message=payload.message,
    )

    async def events() -> AsyncIterator[str]:
        chunks: list[str] = []
        completed = False

        yield ": connected\n\n"

        try:
            async for event in stream_with_fallback(
                messages,
                settings=settings,
                character=payload.character,
            ):
                if event.notice:
                    yield _sse({"notice": event.notice})

                if event.delta:
                    chunks.append(event.delta)
                    yield _sse({"delta": event.delta})

                if event.error:
                    yield _sse(
                        {
                            "error": {
                                "code": "provider_error",
                                "message": event.error,
                            }
                        }
                    )
                    break

                if event.done:
                    completed = True
                    yield _sse(
                        {
                            "done": True,
                            "provider": event.provider,
                            "usage": {},
                        }
                    )
                    break
        finally:
            if completed and chunks:
                try:
                    history.append(payload.session_id, "assistant", "".join(chunks))
                except Exception:  # noqa: BLE001 - сбой записи не должен рвать ответ
                    logger.exception("Не удалось сохранить историю чата")

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
