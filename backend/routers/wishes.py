"""Желания: CRUD, план из шагов и прогресс.

Данные изолированы по владельцу: для гостя это `X-Guest-Id`, после входа —
аккаунт. Регистрация не требуется.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from backend.auth import get_owner_id
from backend.errors import ApiError
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


@router.get("", response_model=WishList, summary="Список желаний")
async def list_wishes_endpoint(owner_id: str = Depends(get_owner_id)) -> WishList:
    return WishList(wishes=list_wishes(owner_id))


@router.post(
    "",
    response_model=Wish,
    status_code=201,
    summary="Создать желание и получить план",
)
async def create_wish_endpoint(
    payload: WishCreate,
    owner_id: str = Depends(get_owner_id),
) -> Wish:
    steps = await build_plan(payload.title, payload.note)
    wish = new_wish(payload.title, payload.note, steps)
    return save_wish(owner_id, wish)


@router.patch(
    "/{wish_id}",
    response_model=Wish,
    responses=_ERRORS,
    summary="Обновить желание или шаги",
)
async def update_wish_endpoint(
    wish_id: str,
    payload: WishUpdate,
    owner_id: str = Depends(get_owner_id),
) -> Wish:
    updated = update_wish(owner_id, wish_id, payload)
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
    owner_id: str = Depends(get_owner_id),
) -> Wish:
    updated = await regenerate_plan(owner_id, wish_id)
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
    owner_id: str = Depends(get_owner_id),
) -> Response:
    if not delete_wish(owner_id, wish_id):
        raise ApiError(404, "wish_not_found", _NOT_FOUND)
    return Response(status_code=204)
