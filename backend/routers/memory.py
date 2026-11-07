"""Память пользователя: чтение, замена и удаление снимка фактов."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from backend.auth import get_owner_id
from backend.memory import clear_memory, read_memory, write_memory
from backend.schemas import MemorySnapshot, MemoryUpdate

router = APIRouter(prefix="/memory", tags=["memory"])


@router.get("", response_model=MemorySnapshot, summary="Факты о пользователе")
async def get_memory(owner_id: str = Depends(get_owner_id)) -> MemorySnapshot:
    return read_memory(owner_id)


@router.put("", response_model=MemorySnapshot, summary="Заменить факты")
async def put_memory(
    payload: MemoryUpdate,
    owner_id: str = Depends(get_owner_id),
) -> MemorySnapshot:
    return write_memory(owner_id, payload.facts)


@router.delete("", status_code=204, summary="Забыть всё")
async def delete_memory(owner_id: str = Depends(get_owner_id)) -> Response:
    clear_memory(owner_id)
    return Response(status_code=204)
