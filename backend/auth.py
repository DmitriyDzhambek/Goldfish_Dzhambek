"""Аккаунты, сессии и Яндекс OAuth.

Регистрация необязательна: гость получает весь функционал. Вход нужен только
для синхронизации желаний и памяти между устройствами.

Безопасность:
  - секреты OAuth читаются только на сервере;
  - в cookie лежит случайный токен, в хранилище — только его SHA-256;
  - cookie HttpOnly + SameSite=Lax, Secure включается для HTTPS;
  - после входа гостевые данные переносятся в аккаунт.
"""

from __future__ import annotations

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone
from threading import Lock

import httpx
from fastapi import Request, Response
from pydantic import ValidationError

from backend.config import Settings, get_settings
from backend.db import get_store
from backend.guest import DEFAULT_GUEST, get_guest_id, is_valid_guest_id
from backend.schemas import Account, TransferSummary

SESSION_COOKIE = "zr_session"
OAUTH_STATE_COOKIE = "zr_oauth_state"
OAUTH_GUEST_COOKIE = "zr_oauth_guest"

SESSION_TTL_SECONDS = 30 * 24 * 60 * 60
OAUTH_STATE_TTL_SECONDS = 10 * 60

ACCOUNTS_KEY = "accounts"
SESSIONS_KEY = "auth_sessions"

YANDEX_AUTHORIZE_URL = "https://oauth.yandex.ru/authorize"
YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
YANDEX_INFO_URL = "https://login.yandex.ru/info"

_LOCK = Lock()
_SAFE_TOKEN = re.compile(r"^[A-Za-z0-9_-]{20,128}$")


class OAuthError(Exception):
    """Яндекс не пустил или вернул некорректный профиль."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(moment: datetime) -> str:
    return moment.astimezone(timezone.utc).isoformat()


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _accounts(data: dict[str, object]) -> dict[str, dict[str, object]]:
    raw = data.get(ACCOUNTS_KEY)
    if not isinstance(raw, dict):
        raw = {}
        data[ACCOUNTS_KEY] = raw
    return raw  # type: ignore[return-value]


def _sessions(data: dict[str, object]) -> dict[str, dict[str, object]]:
    raw = data.get(SESSIONS_KEY)
    if not isinstance(raw, dict):
        raw = {}
        data[SESSIONS_KEY] = raw
    return raw  # type: ignore[return-value]


def _to_account(raw: dict[str, object]) -> Account | None:
    try:
        return Account(
            id=str(raw["id"]),
            name=str(raw.get("name") or "Гость Яндекса"),
            email=str(raw["email"]) if raw.get("email") else None,
            avatar_url=str(raw["avatarUrl"]) if raw.get("avatarUrl") else None,
            created_at=str(raw.get("createdAt") or _iso(_now())),
        )
    except (KeyError, ValidationError):
        return None


def upsert_account(
    *,
    yandex_id: str,
    name: str,
    email: str | None,
    avatar_url: str | None,
) -> Account:
    """Создаёт или обновляет аккаунт по стабильному Яндекс ID."""
    now = _iso(_now())

    with _LOCK:
        store = get_store()
        data = store.read()
        accounts = _accounts(data)

        existing = accounts.get(yandex_id)
        account_id = (
            str(existing.get("id"))
            if isinstance(existing, dict) and existing.get("id")
            else f"usr-{secrets.token_hex(8)}"
        )
        created_at = (
            str(existing.get("createdAt"))
            if isinstance(existing, dict) and existing.get("createdAt")
            else now
        )

        raw = {
            "id": account_id,
            "yandexId": yandex_id,
            "name": name.strip()[:120] or "Гость Яндекса",
            "email": email.strip()[:254] if email else None,
            "avatarUrl": avatar_url[:500] if avatar_url else None,
            "createdAt": created_at,
            "updatedAt": now,
        }
        accounts[yandex_id] = raw
        store.write(data)

    account = _to_account(raw)
    if account is None:  # pragma: no cover - защита от повреждённого хранилища
        raise OAuthError("Не удалось сохранить профиль")
    return account


def create_session(account_id: str) -> str:
    token = secrets.token_urlsafe(32)
    expires = _now() + timedelta(seconds=SESSION_TTL_SECONDS)

    with _LOCK:
        store = get_store()
        data = store.read()
        sessions = _sessions(data)
        sessions[_hash_token(token)] = {
            "accountId": account_id,
            "createdAt": _iso(_now()),
            "expiresAt": _iso(expires),
        }
        store.write(data)

    return token


def _find_account(accounts: dict[str, dict[str, object]], account_id: str) -> Account | None:
    for raw in accounts.values():
        if isinstance(raw, dict) and raw.get("id") == account_id:
            return _to_account(raw)
    return None


def resolve_session(token: str | None) -> Account | None:
    if not token or not _SAFE_TOKEN.fullmatch(token):
        return None

    with _LOCK:
        store = get_store()
        data = store.read()
        sessions = _sessions(data)
        key = _hash_token(token)
        session = sessions.get(key)
        if not isinstance(session, dict):
            return None

        expires_raw = session.get("expiresAt")
        try:
            expires = datetime.fromisoformat(str(expires_raw))
        except (TypeError, ValueError):
            sessions.pop(key, None)
            store.write(data)
            return None

        if expires <= _now():
            sessions.pop(key, None)
            store.write(data)
            return None

        account = _find_account(_accounts(data), str(session.get("accountId") or ""))

    return account


def delete_session(token: str | None) -> None:
    if not token or not _SAFE_TOKEN.fullmatch(token):
        return

    with _LOCK:
        store = get_store()
        data = store.read()
        sessions = _sessions(data)
        if sessions.pop(_hash_token(token), None) is not None:
            store.write(data)


def get_owner_id(request: Request) -> str:
    """Владелец данных: аккаунт после входа, иначе анонимный гость."""
    account = resolve_session(request.cookies.get(SESSION_COOKIE))
    if account is not None:
        return f"user-{account.id}"
    return get_guest_id(request)


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=SESSION_TTL_SECONDS,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# ── Перенос гостевых данных ──────────────────────────────────


def transfer_guest_data(guest_id: str, owner_id: str) -> TransferSummary:
    """Переносит желания и память гостя в аккаунт после входа.

    Если у аккаунта уже есть данные (вход на другом устройстве), они
    сохраняются, а гостевые факты аккуратно дополняются без дублей.
    """
    if guest_id == owner_id or guest_id == DEFAULT_GUEST:
        return TransferSummary()

    moved_wishes = 0
    moved_facts = 0

    with _LOCK:
        store = get_store()
        data = store.read()

        wishes = data.get("wishes")
        if isinstance(wishes, dict):
            guest_wishes = wishes.get(guest_id)
            owner_wishes = wishes.get(owner_id)
            if isinstance(guest_wishes, list) and guest_wishes:
                if not isinstance(owner_wishes, list) or not owner_wishes:
                    wishes[owner_id] = guest_wishes
                    moved_wishes = len(guest_wishes)
                else:
                    known = {
                        str(item.get("id"))
                        for item in owner_wishes
                        if isinstance(item, dict)
                    }
                    extra = [
                        item
                        for item in guest_wishes
                        if isinstance(item, dict) and str(item.get("id")) not in known
                    ]
                    wishes[owner_id] = owner_wishes + extra
                    moved_wishes = len(extra)
                wishes.pop(guest_id, None)

        memory = data.get("memory")
        if isinstance(memory, dict):
            guest_memory = memory.get(guest_id)
            owner_memory = memory.get(owner_id)
            if isinstance(guest_memory, dict):
                guest_facts = guest_memory.get("facts")
                owner_facts = (
                    owner_memory.get("facts")
                    if isinstance(owner_memory, dict)
                    else None
                )
                if isinstance(guest_facts, list) and guest_facts:
                    if not isinstance(owner_facts, list):
                        owner_facts = []

                    seen = {
                        (
                            str(fact.get("kind")),
                            str(fact.get("value", "")).strip().casefold(),
                        )
                        for fact in owner_facts
                        if isinstance(fact, dict)
                    }
                    extra = []
                    for fact in guest_facts:
                        if not isinstance(fact, dict):
                            continue
                        key = (
                            str(fact.get("kind")),
                            str(fact.get("value", "")).strip().casefold(),
                        )
                        if not key[1] or key in seen:
                            continue
                        seen.add(key)
                        extra.append(fact)

                    memory[owner_id] = {
                        "facts": owner_facts + extra,
                        "updatedAt": _iso(_now()),
                    }
                    moved_facts = len(extra)
                    memory.pop(guest_id, None)

        store.write(data)

    return TransferSummary(wishes=moved_wishes, facts=moved_facts)


# ── Яндекс OAuth ─────────────────────────────────────────────


def authorize_url(settings: Settings, state: str) -> str:
    params = httpx.QueryParams(
        {
            "response_type": "code",
            "client_id": settings.yandex_client_id,
            "redirect_uri": settings.yandex_redirect_uri,
            "state": state,
            "force_confirm": "yes",
        }
    )
    return f"{YANDEX_AUTHORIZE_URL}?{params}"


def _profile_to_fields(profile: dict[str, object]) -> dict[str, object]:
    yandex_id = str(profile.get("id") or "").strip()
    if not yandex_id:
        raise OAuthError("Яндекс не вернул идентификатор пользователя")

    name = (
        profile.get("display_name")
        or profile.get("real_name")
        or profile.get("login")
        or "Гость Яндекса"
    )
    email = profile.get("default_email")
    avatar_id = profile.get("default_avatar_id")
    avatar_url = (
        f"https://avatars.yandex.net/get-yapic/{avatar_id}/islands-200"
        if isinstance(avatar_id, str) and avatar_id
        else None
    )

    return {
        "yandex_id": yandex_id[:128],
        "name": str(name)[:120],
        "email": str(email)[:254] if email else None,
        "avatar_url": avatar_url,
    }


async def fetch_yandex_profile(code: str, settings: Settings) -> dict[str, object]:
    """Меняет код на токен и забирает профиль. Секреты не покидают сервер."""
    if not settings.yandex_enabled:
        raise OAuthError("Яндекс OAuth не настроен")

    timeout = httpx.Timeout(connect=5.0, read=20.0, write=10.0, pool=5.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            token_response = await client.post(
                YANDEX_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "client_id": settings.yandex_client_id,
                    "client_secret": settings.yandex_client_secret,
                },
            )
            if token_response.status_code >= 400:
                raise OAuthError("Яндекс отклонил код авторизации")

            access_token = token_response.json().get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise OAuthError("Яндекс не вернул токен доступа")

            info_response = await client.get(
                YANDEX_INFO_URL,
                params={"format": "json"},
                headers={"Authorization": f"OAuth {access_token}"},
            )
            if info_response.status_code >= 400:
                raise OAuthError("Не удалось получить профиль Яндекса")

            profile = info_response.json()
    except httpx.HTTPError as exc:
        raise OAuthError("Яндекс временно недоступен") from exc

    if not isinstance(profile, dict):
        raise OAuthError("Яндекс вернул некорректный профиль")
    return _profile_to_fields(profile)


def safe_guest_from_query(value: str | None, request: Request) -> str:
    if is_valid_guest_id(value):
        return str(value).strip()
    return get_guest_id(request)
