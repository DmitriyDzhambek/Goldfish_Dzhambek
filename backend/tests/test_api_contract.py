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


def test_memory_stub(client: TestClient) -> None:
    assert client.get("/api/memory").status_code == 501

    updated = client.put("/api/memory", json={"facts": []})
    assert updated.status_code == 501


def test_auth_stub_and_email_validation(client: TestClient) -> None:
    accepted = client.post("/api/auth/request", json={"email": "me@example.com"})
    assert accepted.status_code == 501

    invalid = client.post("/api/auth/request", json={"email": "not-an-email"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "validation_error"


def test_unknown_route_is_json_error(client: TestClient) -> None:
    response = client.get("/api/nothing-here")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
