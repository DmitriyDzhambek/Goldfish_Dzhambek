from __future__ import annotations

import hashlib

from fastapi.testclient import TestClient

from backend.auth import (
    OAUTH_GUEST_COOKIE,
    OAUTH_STATE_COOKIE,
    SESSION_COOKIE,
    create_session,
    delete_session,
    resolve_session,
    transfer_guest_data,
    upsert_account,
)
from backend.config import get_settings
from backend.db import get_store


def test_account_and_session_roundtrip() -> None:
    account = upsert_account(
        yandex_id="yandex-test-1",
        name="Иван Мореходов",
        email="ivan@example.com",
        avatar_url="https://avatars.yandex.net/example",
    )

    assert account.id.startswith("usr-")
    assert account.email == "ivan@example.com"

    token = create_session(account.id)
    resolved = resolve_session(token)

    assert resolved is not None
    assert resolved.id == account.id

    # В хранилище лежит только SHA-256 токена, не сам токен.
    raw = get_store().read()
    sessions = raw["auth_sessions"]
    assert hashlib.sha256(token.encode("utf-8")).hexdigest() in sessions
    assert token not in sessions

    delete_session(token)
    assert resolve_session(token) is None


def test_upsert_updates_existing_account() -> None:
    first = upsert_account(
        yandex_id="yandex-test-2",
        name="Старое имя",
        email=None,
        avatar_url=None,
    )
    second = upsert_account(
        yandex_id="yandex-test-2",
        name="Новое имя",
        email="new@example.com",
        avatar_url=None,
    )

    assert first.id == second.id
    assert second.name == "Новое имя"
    assert second.email == "new@example.com"


def test_transfer_guest_data_moves_wishes_and_dedupes_facts(client: TestClient) -> None:
    guest = "auth-transfer-guest"
    headers = {"X-Guest-Id": guest}

    wish = client.post(
        "/api/wishes",
        headers=headers,
        json={"title": "Собрать портфолио"},
    ).json()

    client.put(
        "/api/memory",
        headers=headers,
        json={
            "facts": [
                {
                    "id": "f1",
                    "kind": "name",
                    "value": "Иван",
                    "createdAt": "2026-01-01T00:00:00+00:00",
                }
            ]
        },
    )

    summary = transfer_guest_data(guest, "user-account-transfer")

    assert summary.wishes == 1
    assert summary.facts == 1

    data = get_store().read()
    assert guest not in data["wishes"]
    assert data["wishes"]["user-account-transfer"][0]["id"] == wish["id"]
    assert guest not in data["memory"]

    again = transfer_guest_data(guest, "user-account-transfer")
    assert again.wishes == 0
    assert again.facts == 0


def test_transfer_guest_data_keeps_existing_account_data() -> None:
    store = get_store()
    data = store.read()
    data.setdefault("memory", {})["user-account-keep"] = {
        "facts": [
            {
                "id": "own",
                "kind": "name",
                "value": "Мария",
                "createdAt": "2026-01-01T00:00:00+00:00",
            }
        ],
        "updatedAt": "2026-01-01T00:00:00+00:00",
    }
    data["memory"]["auth-keep-guest"] = {
        "facts": [
            {
                "id": "dup",
                "kind": "name",
                "value": "мария",
                "createdAt": "2026-01-01T00:00:00+00:00",
            },
            {
                "id": "fresh",
                "kind": "goal",
                "value": "запустить проект",
                "createdAt": "2026-01-01T00:00:00+00:00",
            },
        ],
        "updatedAt": "2026-01-01T00:00:00+00:00",
    }
    store.write(data)

    summary = transfer_guest_data("auth-keep-guest", "user-account-keep")

    assert summary.facts == 1
    facts = store.read()["memory"]["user-account-keep"]["facts"]
    assert {fact["value"] for fact in facts} == {"Мария", "запустить проект"}


def test_guest_owner_uses_header_without_session(client: TestClient) -> None:
    response = client.put(
        "/api/memory",
        headers={"X-Guest-Id": "auth-owner-guest"},
        json={"facts": []},
    )

    assert response.status_code == 200

    data = get_store().read()
    assert "auth-owner-guest" in data["memory"]


def test_yandex_callback_rejects_bad_state(client: TestClient) -> None:
    response = client.get(
        "/api/auth/yandex/callback?code=abc&state=forged",
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].endswith("/?auth=error")


def test_me_reports_session_account(client: TestClient) -> None:
    account = upsert_account(
        yandex_id="yandex-test-me",
        name="Тестовый Аккаунт",
        email=None,
        avatar_url=None,
    )
    token = create_session(account.id)

    client.cookies.set(SESSION_COOKIE, token)
    response = client.get("/api/auth/me")
    client.cookies.clear()

    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is True
    assert body["account"]["id"] == account.id
    assert body["guest"] is False


def test_logout_clears_session(client: TestClient) -> None:
    account = upsert_account(
        yandex_id="yandex-test-logout",
        name="Уходящий",
        email=None,
        avatar_url=None,
    )
    token = create_session(account.id)
    client.cookies.set(SESSION_COOKIE, token)

    logout = client.post("/api/auth/logout")
    assert logout.status_code == 204
    assert resolve_session(token) is None

    client.cookies.clear()
    assert client.get("/api/auth/me").json()["authenticated"] is False


def test_oauth_start_rejects_when_not_configured(client: TestClient) -> None:
    response = client.get(
        "/api/auth/yandex/start",
        params={"guestId": "auth-guest-start"},
        follow_redirects=False,
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "oauth_not_configured"


def test_oauth_cookies_are_not_set_without_config(client: TestClient) -> None:
    settings = get_settings()
    assert settings.yandex_enabled is False

    response = client.get("/api/auth/yandex/start", follow_redirects=False)

    assert OAUTH_STATE_COOKIE not in response.cookies
    assert OAUTH_GUEST_COOKIE not in response.cookies
