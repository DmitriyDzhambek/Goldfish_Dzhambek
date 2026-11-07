"""Память пользователя: факты, автоизвлечение и строки для промта.

Факты привязаны к владельцу: гость определяется `X-Guest-Id`, после входа —
cookie-сессией. Поэтому перенос данных в аккаунт не теряет память.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from pydantic import ValidationError

from backend.db import get_store
from backend.schemas import MemoryFact, MemoryKind, MemorySnapshot

KIND_LABELS: dict[str, str] = {
    "name": "имя",
    "goal": "цель",
    "habit": "привычка",
    "date": "важная дата",
    "other": "факт",
}

MEMORY_KEY = "memory"
MAX_FACTS = 200
MAX_FACT_LENGTH = 2000
MAX_AUTO_FACTS = 3
_SPACES = re.compile(r"\s+")

_LOCK = Lock()

_PATTERNS: tuple[tuple[MemoryKind, re.Pattern[str]], ...] = (
    (
        "name",
        re.compile(
            r"(?:меня зовут|мо[её] имя|зови меня)\s+"
            r"([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё-]{1,30})",
            re.IGNORECASE,
        ),
    ),
    (
        "goal",
        re.compile(
            r"(?:я хочу|моя цель|мечтаю|хочу научиться)\s+([^.!?\n]{3,160})",
            re.IGNORECASE,
        ),
    ),
    (
        "habit",
        re.compile(
            r"(?:я обычно|каждый день|по утрам|по вечерам|у меня привычка)\s+"
            r"([^.!?\n]{3,160})",
            re.IGNORECASE,
        ),
    ),
    (
        "date",
        re.compile(
            r"(?:день рождения|важная дата|годовщина)[^.!?\n]{0,100}",
            re.IGNORECASE,
        ),
    ),
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return f"fact-{uuid4().hex[:12]}"


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


def user_name_from_facts(facts: Sequence[MemoryFact]) -> str | None:
    for fact in facts:
        if fact.kind == "name" and fact.value.strip():
            return fact.value.strip()
    return None


def normalize_facts(facts: Sequence[MemoryFact]) -> list[MemoryFact]:
    """Чистит факты: убирает пустые, дубли и лишнюю длину."""
    result: list[MemoryFact] = []
    seen: set[tuple[str, str]] = set()
    known_ids: set[str] = set()

    for fact in facts:
        value = _SPACES.sub(" ", fact.value).strip()[:MAX_FACT_LENGTH]
        if not value:
            continue

        key = (fact.kind, value.casefold())
        if key in seen:
            continue
        seen.add(key)

        fact_id = fact.id.strip()[:64] or _new_id()
        while fact_id in known_ids:
            fact_id = _new_id()
        known_ids.add(fact_id)

        result.append(
            MemoryFact(
                id=fact_id,
                kind=fact.kind,
                value=value,
                created_at=fact.created_at or _now(),
            )
        )

        if len(result) >= MAX_FACTS:
            break

    return result


def _read_bucket(owner_id: str) -> dict[str, object] | None:
    data = get_store().read()
    bucket = data.get(MEMORY_KEY)
    if not isinstance(bucket, dict):
        return None
    raw = bucket.get(owner_id)
    return raw if isinstance(raw, dict) else None


def read_memory(owner_id: str) -> MemorySnapshot:
    with _LOCK:
        raw = _read_bucket(owner_id)

    if raw is None:
        return MemorySnapshot()

    facts_raw = raw.get("facts")
    facts: list[MemoryFact] = []
    if isinstance(facts_raw, list):
        for item in facts_raw:
            try:
                facts.append(MemoryFact.model_validate(item))
            except ValidationError:
                continue

    return MemorySnapshot(
        facts=normalize_facts(facts),
        updated_at=str(raw["updatedAt"]) if raw.get("updatedAt") else None,
    )


def write_memory(owner_id: str, facts: Sequence[MemoryFact]) -> MemorySnapshot:
    snapshot = MemorySnapshot(facts=normalize_facts(facts), updated_at=_now())

    with _LOCK:
        store = get_store()
        data = store.read()
        bucket = data.get(MEMORY_KEY)
        if not isinstance(bucket, dict):
            bucket = {}
            data[MEMORY_KEY] = bucket

        bucket[owner_id] = {
            "facts": [fact.model_dump(by_alias=True) for fact in snapshot.facts],
            "updatedAt": snapshot.updated_at,
        }
        store.write(data)

    return snapshot


def clear_memory(owner_id: str) -> bool:
    """Удаляет все факты владельца. Возвращает True, если что-то было."""
    with _LOCK:
        store = get_store()
        data = store.read()
        bucket = data.get(MEMORY_KEY)
        if not isinstance(bucket, dict) or owner_id not in bucket:
            return False

        bucket.pop(owner_id, None)
        store.write(data)

    return True


def extract_facts(text: str) -> list[MemoryFact]:
    """Аккуратно вытаскивает факты из реплики пользователя без LLM."""
    result: list[MemoryFact] = []
    seen: set[str] = set()

    for kind, pattern in _PATTERNS:
        for match in pattern.finditer(text):
            value = match.group(1) if match.groups() else match.group(0)
            value = _SPACES.sub(" ", value).strip(" .,!?:;—-\t")
            if len(value) < 2:
                continue

            key = value.casefold()
            if key in seen:
                continue
            seen.add(key)
            result.append(
                MemoryFact(
                    id=_new_id(),
                    kind=kind,
                    value=value[:200],
                    created_at=_now(),
                )
            )

            if len(result) >= MAX_AUTO_FACTS:
                return result

    return result


def remember_from_message(owner_id: str, text: str) -> list[MemoryFact]:
    """Дополняет память фактами из сообщения, не дублируя известное."""
    existing = read_memory(owner_id)
    known = {(fact.kind, fact.value.casefold()) for fact in existing.facts}

    added: list[MemoryFact] = []
    for fact in extract_facts(text):
        key = (fact.kind, fact.value.casefold())
        if key in known:
            continue
        known.add(key)
        added.append(fact)

    if not added:
        return []

    write_memory(owner_id, [*existing.facts, *added])
    return added
