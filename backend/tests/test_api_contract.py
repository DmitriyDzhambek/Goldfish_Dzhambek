from __future__ import annotations

from fastapi.testclient import TestClient


def test_health(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["free"] is True
    assert body["limits"] == "unlimited"


def test_chat_streams_offline_without_keys(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={"sessionId": "session-1", "message": "Привет, рыбка"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert '"delta"' in response.text
    assert '"provider":"offline"' in response.text
    assert response.text.rstrip().endswith("data: [DONE]")


def test_validation_uses_same_envelope(client: TestClient) -> None:
    response = client.post("/api/chat", json={"message": ""})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "message" in body["error"]["message"]


def test_chat_rejects_unknown_character(client: TestClient) -> None:
    response = client.post(
        "/api/chat",
        json={"sessionId": "s", "message": "Привет", "character": "dragon"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_memory_defaults_to_empty_snapshot(client: TestClient) -> None:
    response = client.get(
        "/api/memory",
        headers={"X-Guest-Id": "contract-memory-01"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["facts"] == []
    assert body["updatedAt"] is None


def test_auth_me_reports_guest_and_oauth_state(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    body = response.json()
    assert body["authenticated"] is False
    assert body["account"] is None
    assert body["oauthEnabled"] is False
    assert body["provider"] == "yandex"
    assert body["guest"] is True


def test_yandex_start_without_config_is_explained(client: TestClient) -> None:
    response = client.get("/api/auth/yandex/start", follow_redirects=False)

    assert response.status_code == 503
    body = response.json()
    assert body["error"]["code"] == "oauth_not_configured"
    assert "YANDEX_CLIENT_ID" in body["error"]["message"]


def test_unknown_route_is_json_error(client: TestClient) -> None:
    response = client.get("/api/nothing-here")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
