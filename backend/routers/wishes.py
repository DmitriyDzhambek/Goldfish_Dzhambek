"""Желания и шаги. CRUD появится на этапе 2–3."""

from __future__ import annotations

from fastapi import APIRouter

from backend.errors import ApiError
from backend.schemas import ErrorResponse, Wish, WishCreate, WishList, WishUpdate

router = APIRouter(prefix="/wishes", tags=["wishes"])

_NOT_READY = "Желания появятся на этапе 2: создание, план из шагов и прогресс."
_ERRORS = {501: {"model": ErrorResponse, "description": "Ещё не реализовано"}}


@router.get("", response_model=WishList, responses=_ERRORS, summary="Список желаний")
async def list_wishes() -> WishList:
    raise ApiError(501, "not_implemented", _NOT_READY)


@router.post(
    "",
    response_model=Wish,
    status_code=201,
    responses=_ERRORS,
    summary="Создать желание",
)
async def create_wish(_: WishCreate) -> Wish:
    raise ApiError(501, "not_implemented", _NOT_READY)


@router.patch(
    "/{wish_id}",
    response_model=Wish,
    responses=_ERRORS,
    summary="Обновить желание или шаги",
)
async def update_wish(wish_id: str, _: WishUpdate) -> Wish:
    raise ApiError(501, "not_implemented", _NOT_READY)
