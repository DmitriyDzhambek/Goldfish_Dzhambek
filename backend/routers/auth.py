"""Вход через Яндекс и личный кабинет.

Регистрация необязательна: гость получает весь функционал. Вход нужен только
для переноса и синхронизации данных между устройствами.
"""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import RedirectResponse

from backend.auth import (
    OAUTH_GUEST_COOKIE,
    OAUTH_STATE_COOKIE,
    OAUTH_STATE_TTL_SECONDS,
    SESSION_COOKIE,
    authorize_url,
    clear_session_cookie,
    create_session,
    delete_session,
    fetch_yandex_profile,
    resolve_session,
    safe_guest_from_query,
    set_session_cookie,
    transfer_guest_data,
    upsert_account,
    OAuthError,
)
from backend.config import get_settings
from backend.errors import ApiError
from backend.guest import DEFAULT_GUEST, is_valid_guest_id
from backend.schemas import AuthMe, ErrorResponse

router = APIRouter(prefix="/auth", tags=["auth"])

_NOT_CONFIGURED = (
    "Вход через Яндекс ещё не настроен на сервере. "
    "Добавьте YANDEX_CLIENT_ID, YANDEX_CLIENT_SECRET и YANDEX_REDIRECT_URI в .env."
)


def _error_redirect(base_url: str) -> RedirectResponse:
    return RedirectResponse(f"{base_url}/?auth=error", status_code=302)


@router.get("/me", response_model=AuthMe, summary="Текущий аккаунт")
async def me(request: Request) -> AuthMe:
    settings = get_settings()
    account = resolve_session(request.cookies.get(SESSION_COOKIE))

    return AuthMe(
        authenticated=account is not None,
        account=account,
        oauth_enabled=settings.yandex_enabled,
        guest=account is None,
    )


@router.get(
    "/yandex/start",
    summary="Начать вход через Яндекс",
    responses={503: {"model": ErrorResponse, "description": "OAuth не настроен"}},
)
async def yandex_start(
    request: Request,
    guest_id: str | None = Query(default=None, alias="guestId", max_length=128),
) -> RedirectResponse:
    settings = get_settings()
    if not settings.yandex_enabled:
        raise ApiError(503, "oauth_not_configured", _NOT_CONFIGURED)

    state = secrets.token_urlsafe(24)
    guest = safe_guest_from_query(guest_id, request)

    response = RedirectResponse(
        authorize_url(settings, state),
        status_code=302,
    )
    cookie_options = {
        "max_age": OAUTH_STATE_TTL_SECONDS,
        "httponly": True,
        "secure": settings.secure_cookies,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(OAUTH_STATE_COOKIE, state, **cookie_options)
    response.set_cookie(OAUTH_GUEST_COOKIE, guest, **cookie_options)

    return response


@router.get("/yandex/callback", summary="Завершить вход через Яндекс")
async def yandex_callback(
    request: Request,
    code: str | None = Query(default=None, max_length=2048),
    state: str | None = Query(default=None, max_length=512),
    error: str | None = Query(default=None, max_length=128),
) -> RedirectResponse:
    settings = get_settings()
    expected_state = request.cookies.get(OAUTH_STATE_COOKIE)

    if (
        error
        or not code
        or not state
        or not expected_state
        or not secrets.compare_digest(state, expected_state)
    ):
        return _error_redirect(settings.public_base_url)

    try:
        profile = await fetch_yandex_profile(code, settings)
        account = upsert_account(**profile)  # type: ignore[arg-type]
    except OAuthError:
        return _error_redirect(settings.public_base_url)

    guest = request.cookies.get(OAUTH_GUEST_COOKIE, DEFAULT_GUEST)
    if not is_valid_guest_id(guest):
        guest = DEFAULT_GUEST
    transfer_guest_data(guest, f"user-{account.id}")

    token = create_session(account.id)
    response = RedirectResponse(
        f"{settings.public_base_url}/?auth=ok",
        status_code=302,
    )
    set_session_cookie(response, token, settings)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/")
    response.delete_cookie(OAUTH_GUEST_COOKIE, path="/")

    return response


@router.post("/logout", status_code=204, summary="Выйти из аккаунта")
async def logout(request: Request) -> Response:
    delete_session(request.cookies.get(SESSION_COOKIE))

    response = Response(status_code=204)
    clear_session_cookie(response)
    return response
