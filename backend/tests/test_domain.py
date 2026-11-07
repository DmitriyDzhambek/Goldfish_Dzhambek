from __future__ import annotations

from backend.memory import facts_to_prompt
from backend.schemas import MemoryFact, WishStep
from backend.wishes import compute_progress, clamp_plan


def make_step(step_id: str, done: bool) -> WishStep:
    return WishStep(id=step_id, title="Шаг", done=done)


def test_progress_of_empty_plan_is_zero() -> None:
    assert compute_progress([]) == 0


def test_progress_counts_done_steps() -> None:
    assert compute_progress([make_step("1", True), make_step("2", False), make_step("3", False)]) == 33
    assert compute_progress([make_step("1", True), make_step("2", False)]) == 50
    assert compute_progress([make_step("1", True), make_step("2", True)]) == 100


def test_plan_is_limited_to_seven_steps() -> None:
    steps = [make_step(str(index), False) for index in range(10)]
    assert len(clamp_plan(steps)) == 7


def test_facts_are_deduplicated_and_labelled() -> None:
    facts = [
        MemoryFact(id="1", kind="name", value="Иван", created_at="2026-01-01T00:00:00Z"),
        MemoryFact(id="2", kind="name", value="  иван ", created_at="2026-01-02T00:00:00Z"),
        MemoryFact(id="3", kind="goal", value="Заработать на отпуск", created_at="2026-01-03T00:00:00Z"),
    ]

    assert facts_to_prompt(facts) == ["имя: Иван", "цель: Заработать на отпуск"]
