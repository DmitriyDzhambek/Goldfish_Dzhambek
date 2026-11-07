from __future__ import annotations

from fastapi.testclient import TestClient

from backend.memory import extract_facts, facts_to_prompt
from backend.schemas import MemoryFact

GUEST = {"X-Guest-Id": "memory-guest-0001"}
OTHER = {"X-Guest-Id": "memory-guest-0002"}

FACTS = [
    {
        "id": "fact-name",
        "kind": "name",
        "value": "Иван",
        "createdAt": "2026-01-01T00:00:00+00:00",
    },
    {
        "id": "fact-goal",
        "kind": "goal",
        "value": "выучить Python",
        "createdAt": "2026-01-01T00:00:00+00:00",
    },
]


def test_memory_roundtrip_and_isolation(client: TestClient) -> None:
    saved = client.put("/api/memory", headers=GUEST, json={"facts": FACTS})

    assert saved.status_code == 200
    body = saved.json()
    assert [fact["value"] for fact in body["facts"]] == ["Иван", "выучить Python"]
    assert body["updatedAt"]

    own = client.get("/api/memory", headers=GUEST).json()
    assert len(own["facts"]) == 2

    other = client.get("/api/memory", headers=OTHER).json()
    assert other["facts"] == []
    assert other["updatedAt"] is None


def test_memory_deduplicates_and_drops_empty(client: TestClient) -> None:
    payload = {
        "facts": [
            {
                "id": "one",
                "kind": "name",
                "value": "  Иван  ",
                "createdAt": "2026-01-01T00:00:00+00:00",
            },
            {
                "id": "two",
                "kind": "name",
                "value": "иван",
                "createdAt": "2026-01-01T00:00:00+00:00",
            },
            {
                "id": "three",
                "kind": "goal",
                "value": "   ",
                "createdAt": "2026-01-01T00:00:00+00:00",
            },
        ]
    }

    response = client.put(
        "/api/memory",
        headers={"X-Guest-Id": "memory-guest-dedup"},
        json=payload,
    )

    assert response.status_code == 200
    facts = response.json()["facts"]
    assert len(facts) == 1
    assert facts[0]["value"] == "Иван"


def test_memory_delete_forgets_everything(client: TestClient) -> None:
    client.put("/api/memory", headers=GUEST, json={"facts": FACTS})

    deleted = client.delete("/api/memory", headers=GUEST)
    assert deleted.status_code == 204

    assert client.get("/api/memory", headers=GUEST).json()["facts"] == []


def test_memory_validation_uses_same_envelope(client: TestClient) -> None:
    response = client.put(
        "/api/memory",
        headers=GUEST,
        json={
            "facts": [
                {
                    "id": "bad",
                    "kind": "name",
                    "value": "",
                    "createdAt": "2026-01-01T00:00:00+00:00",
                }
            ]
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_chat_remembers_name_and_goal_once(client: TestClient) -> None:
    headers = {"X-Guest-Id": "memory-chat-guest"}

    first = client.post(
        "/api/chat",
        headers=headers,
        json={
            "sessionId": "memory-chat-session",
            "message": "Меня зовут Иван. Я хочу выучить Python.",
        },
    )
    assert first.status_code == 200

    facts = client.get("/api/memory", headers=headers).json()["facts"]
    kinds = {fact["kind"] for fact in facts}
    assert "name" in kinds
    assert "goal" in kinds
    assert any(fact["value"] == "Иван" for fact in facts)

    client.post(
        "/api/chat",
        headers=headers,
        json={
            "sessionId": "memory-chat-session",
            "message": "Меня зовут Иван. Я хочу выучить Python.",
        },
    )

    repeated = client.get("/api/memory", headers=headers).json()["facts"]
    assert len(repeated) == len(facts)


def test_extract_facts_and_prompt_labels() -> None:
    facts = extract_facts("Меня зовут Мария, я хочу запустить свой проект.")
    assert any(fact.kind == "name" and fact.value == "Мария" for fact in facts)
    assert any(fact.kind == "goal" for fact in facts)

    lines = facts_to_prompt(facts)
    assert any(line.startswith("имя:") for line in lines)
    assert any(line.startswith("цель:") for line in lines)

    # Одинаковые факты не дублируются в промте.
    duplicate = MemoryFact(
        id="dup",
        kind="name",
        value="мария",
        created_at="2026-01-01T00:00:00+00:00",
    )
    assert len(facts_to_prompt([*facts, duplicate])) == len(facts_to_prompt(facts))
