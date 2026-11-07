from __future__ import annotations

from fastapi.testclient import TestClient

GUEST = {"X-Guest-Id": "guest-wishes-0001"}
OTHER = {"X-Guest-Id": "guest-wishes-0002"}


def create_wish(
    client: TestClient,
    title: str,
    *,
    note: str | None = None,
    headers: dict[str, str] = GUEST,
) -> dict[str, object]:
    response = client.post(
        "/api/wishes",
        headers=headers,
        json={"title": title, "note": note},
    )
    assert response.status_code == 201, response.text

    wish = response.json()
    assert 3 <= len(wish["steps"]) <= 7
    assert wish["progress"] == 0
    assert wish["status"] == "new"
    assert len({step["id"] for step in wish["steps"]}) == len(wish["steps"])

    return wish


def test_create_wish_generates_plan_and_lists_it(client: TestClient) -> None:
    wish = create_wish(client, "Хочу начать бегать по утрам", note="Три раза в неделю")

    assert wish["title"] == "Хочу начать бегать по утрам"
    assert wish["note"] == "Три раза в неделю"
    assert wish["steps"]

    listing = client.get("/api/wishes", headers=GUEST).json()["wishes"]
    assert any(item["id"] == wish["id"] for item in listing)


def test_wishes_are_isolated_by_guest(client: TestClient) -> None:
    wish = create_wish(client, "Собрать минимальный прототип", headers=GUEST)

    listed = client.get("/api/wishes", headers=OTHER).json()["wishes"]
    assert all(item["id"] != wish["id"] for item in listed)


def test_toggling_steps_recomputes_progress_and_status(client: TestClient) -> None:
    wish = create_wish(client, "Выучить 100 английских слов")
    steps = wish["steps"]

    first_done = [dict(step) for step in steps]
    first_done[0]["done"] = True

    response = client.patch(
        f"/api/wishes/{wish['id']}",
        headers=GUEST,
        json={"steps": first_done},
    )
    assert response.status_code == 200

    partial = response.json()
    assert partial["progress"] == round(100 / len(steps))
    assert partial["status"] == "in_progress"

    all_done = [dict(step, done=True) for step in steps]
    response = client.patch(
        f"/api/wishes/{wish['id']}",
        headers=GUEST,
        json={"steps": all_done},
    )

    complete = response.json()
    assert complete["progress"] == 100
    assert complete["status"] == "done"


def test_update_title_and_note(client: TestClient) -> None:
    wish = create_wish(client, "Навести порядок в проекте")

    response = client.patch(
        f"/api/wishes/{wish['id']}",
        headers=GUEST,
        json={"title": "Новое название", "note": "Новая заметка"},
    )

    updated = response.json()
    assert updated["title"] == "Новое название"
    assert updated["note"] == "Новая заметка"
    assert updated["steps"] == wish["steps"]


def test_regenerate_plan_keeps_wish_and_validates_steps(client: TestClient) -> None:
    wish = create_wish(client, "Сделать сайт-портфолио")

    response = client.post(f"/api/wishes/{wish['id']}/plan", headers=GUEST)

    assert response.status_code == 200
    updated = response.json()
    assert updated["id"] == wish["id"]
    assert 3 <= len(updated["steps"]) <= 7
    assert updated["progress"] == 0


def test_delete_wish(client: TestClient) -> None:
    wish = create_wish(client, "Удалить это желание")

    deleted = client.delete(f"/api/wishes/{wish['id']}", headers=GUEST)
    assert deleted.status_code == 204

    listing = client.get("/api/wishes", headers=GUEST).json()["wishes"]
    assert all(item["id"] != wish["id"] for item in listing)

    missing = client.delete(f"/api/wishes/{wish['id']}", headers=GUEST)
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "wish_not_found"


def test_unknown_wish_returns_404(client: TestClient) -> None:
    response = client.patch(
        "/api/wishes/wish-missing",
        headers=GUEST,
        json={"title": "Ничего"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "wish_not_found"


def test_wish_validation_uses_same_envelope(client: TestClient) -> None:
    response = client.post("/api/wishes", headers=GUEST, json={"title": ""})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_offline_plan_is_tailored_and_bounded() -> None:
    from backend.wishes import MAX_PLAN_STEPS, MIN_PLAN_STEPS, offline_plan

    coding = offline_plan("Сделать телеграм-бота")
    running = offline_plan("Начать бегать по утрам")

    for plan in (coding, running):
        assert MIN_PLAN_STEPS <= len(plan) <= MAX_PLAN_STEPS
        assert all(step.title and not step.done for step in plan)
        assert len({step.id for step in plan}) == len(plan)

    assert coding[0].title != running[0].title
