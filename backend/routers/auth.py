"""Вход по email-magic-link. Этап 5.

Важно: регистрация необязательна — гость получает весь функционал.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from backend.errors import ApiError
from backend.schemas import EmailRequest, ErrorResponse, RequestAccepted

router = APIRouter(prefix="/auth", tags=["auth"])

_NOT_READY = "Вход по magic link появится на этапе 5."
_ERRORS = {501: {"model": ErrorResponse, "description": "Ещё не реализовано"}}


@router.post(
    "/request",
    response_model=RequestAccepted,
    status_code=202,
    responses=_ERRORS,
    summary="Отправить magic link",
)
async def request_magic_link(_: EmailRequest) -> RequestAccepted:
    raise ApiError(501, "not_implemented", _NOT_READY)


@router.get(
    "/callback",
    responses=_ERRORS,
    summary="Подтвердить magic link",
)
async def magic_link_callback(token: str = Query(min_length=8, max_length=512)) -> None:
    raise ApiError(501, "not_implemented", _NOT_READY)
