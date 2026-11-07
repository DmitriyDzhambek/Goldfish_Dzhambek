"""Память пользователя: превращение фактов в строки для промта."""

from __future__ import annotations

from collections.abc import Sequence

from backend.schemas import MemoryFact

KIND_LABELS: dict[str, str] = {
    "name": "имя",
    "goal": "цель",
    "habit": "привычка",
    "date": "важная дата",
    "other": "факт",
}


def facts_to_prompt(facts: Sequence[MemoryFact]) -> list[str]:
    """Дедуплицирует факты (без учёта регистра) и подписывает их по-русски."""
    seen: set[tuple[str, str]] = set()
    result: list[str] = []

    for fact in facts:
        key = (fact.kind, fact.value.strip().casefold())
        if not key[1] or key in seen:
            continue
        seen.add(key)
        label = KIND_LABELS.get(fact.kind, "факт")
        result.append(f"{label}: {fact.value.strip()}")

    return result
