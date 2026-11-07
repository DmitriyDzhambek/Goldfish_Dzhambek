"""Память пользователя. Чтение и замена снимка фактов."""

from __future__ import annotations

from fastapi import APIRouter

from backend.errors import ApiError
from backend.schemas import ErrorResponse, MemorySnapshot, MemoryUpdate

router = APIRouter(prefix="/memory", tags=["memory"])

_NOT_READY = "Память появится на этапе 4: факты, сжатие и использование в промте."
_ERRORS = {501: {"model": ErrorResponse, "description": "Ещё не реализовано"}}


@router.get("", response_model=MemorySnapshot, responses=_ERRORS, summary="Факты о пользователе")
async def get_memory() -> MemorySnapshot:
    raise ApiError(501, "not_implemented", _NOT_READY)


@router.put("", response_model=MemorySnapshot, responses=_ERRORS, summary="Заменить факты")
async def put_memory(_: MemoryUpdate) -> MemorySnapshot:
    raise ApiError(501, "not_implemented", _NOT_READY)
