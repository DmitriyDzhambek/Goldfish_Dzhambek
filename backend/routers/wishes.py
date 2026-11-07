"""Желания: CRUD, план из шагов и прогресс.

Данные изолированы по гостю (`X-Guest-Id`). Регистрация не требуется.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from backend.errors import ApiError
from backend.guest import get_guest_id
from backend.schemas import (
    ErrorResponse,
    Wish,
    WishCreate,
    WishList,
    WishUpdate,
)
from backend.wishes import (
    build_plan,
    delete_wish,
    list_wishes,
    new_wish,
    regenerate_plan,
    save_wish,
    update_wish,
)

router = APIRouter(prefix="/wishes", tags=["wishes"])

_NOT_FOUND = "Желание не найдено. Возможно, оно уже исполнено или удалено."
_ERRORS = {404: {"model": ErrorResponse, "description": "Желание не найдено"}}


@router.get("", response_model=WishList, summary="Список желаний гостя")
async def list_wishes_endpoint(guest_id: str = Depends(get_guest_id)) -> WishList:
    return WishList(wishes=list_wishes(guest_id))


@router.post(
    "",
    response_model=Wish,
    status_code=201,
    summary="Создать желание и получить план",
)
async def create_wish_endpoint(
    payload: WishCreate,
    guest_id: str = Depends(get_guest_id),
) -> Wish:
    steps = await build_plan(payload.title, payload.note)
    wish = new_wish(payload.title, payload.note, steps)
    return save_wish(guest_id, wish)


@router.patch(
    "/{wish_id}",
    response_model=Wish,
    responses=_ERRORS,
    summary="Обновить желание или шаги",
)
async def update_wish_endpoint(
    wish_id: str,
    payload: WishUpdate,
    guest_id: str = Depends(get_guest_id),
) -> Wish:
    updated = update_wish(guest_id, wish_id, payload)
    if updated is None:
        raise ApiError(404, "wish_not_found", _NOT_FOUND)
    return updated


@router.post(
    "/{wish_id}/plan",
    response_model=Wish,
    responses=_ERRORS,
    summary="Пересобрать план желания",
)
async def regenerate_plan_endpoint(
    wish_id: str,
    guest_id: str = Depends(get_guest_id),
) -> Wish:
    updated = await regenerate_plan(guest_id, wish_id)
    if updated is None:
        raise ApiError(404, "wish_not_found", _NOT_FOUND)
    return updated


@router.delete(
    "/{wish_id}",
    status_code=204,
    responses=_ERRORS,
    summary="Удалить желание",
)
async def delete_wish_endpoint(
    wish_id: str,
    guest_id: str = Depends(get_guest_id),
) -> Response:
    if not delete_wish(guest_id, wish_id):
        raise ApiError(404, "wish_not_found", _NOT_FOUND)
    return Response(status_code=204)
