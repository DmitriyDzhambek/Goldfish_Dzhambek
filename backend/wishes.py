"""Доменная логика и хранение желаний.

Принципы:
  - прогресс и статус всегда выводятся из шагов — клиент не присылает проценты;
  - план состоит из 3–7 шагов;
  - если LLM недоступна, работает офлайн-шаблон, подобранный под тему желания;
  - данные гостя изолированы по `X-Guest-Id`.
"""

from __future__ import annotations

import asyncio
import re
from collections.abc import Sequence
from datetime import datetime, timezone
from threading import Lock
from uuid import uuid4

from pydantic import ValidationError

from backend.config import get_settings
from backend.db import get_store
from backend.providers import complete_text
from backend.schemas import Wish, WishStatus, WishStep, WishUpdate

MIN_PLAN_STEPS = 3
MAX_PLAN_STEPS = 7
MAX_STORED_STEPS = 32
WISHES_KEY = "wishes"

_LOCK = Lock()
_STEP_PREFIX = re.compile(r"^\s*(?:[-*•]|\d{1,2}[.)])\s+(.+?)\s*$")
_SPACES = re.compile(r"\s+")

PLANNER_PROMPT = (
    "Ты — Золотая Рыбка, спокойный и практичный помощник. "
    "Составь план исполнения желания из 3–7 шагов. "
    "Каждый шаг — конкретное действие, которое можно начать или закончить "
    "за 15–60 минут. Без вступлений, выводов и мотивационных лозунгов. "
    "Формат ответа: только нумерованный список, по одному шагу в строке, "
    "каждый шаг не длиннее 160 символов."
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:12]}"


def compute_progress(steps: Sequence[WishStep]) -> int:
    if not steps:
        return 0

    done = sum(1 for step in steps if step.done)
    return max(0, min(100, round(done * 100 / len(steps))))


def status_for(steps: Sequence[WishStep]) -> WishStatus:
    if not steps:
        return "new"
    progress = compute_progress(steps)
    if progress >= 100:
        return "done"
    if progress > 0:
        return "in_progress"
    return "new"


def clamp_plan(steps: Sequence[WishStep]) -> list[WishStep]:
    """План рыбки — от 3 до 7 шагов; лишние мягко отбрасываем."""
    return list(steps[:MAX_PLAN_STEPS])


# ── Хранилище ────────────────────────────────────────────────


def _read_raw(guest_id: str) -> list[dict[str, object]]:
    data = get_store().read()
    bucket = data.get(WISHES_KEY)
    if not isinstance(bucket, dict):
        return []

    raw = bucket.get(guest_id)
    if not isinstance(raw, list):
        return []

    return [item for item in raw if isinstance(item, dict)]


def _write_raw(guest_id: str, items: list[dict[str, object]]) -> None:
    store = get_store()
    data = store.read()

    bucket = data.get(WISHES_KEY)
    if not isinstance(bucket, dict):
        bucket = {}
        data[WISHES_KEY] = bucket

    bucket[guest_id] = items
    store.write(data)


def list_wishes(guest_id: str) -> list[Wish]:
    with _LOCK:
        raw = _read_raw(guest_id)

    wishes: list[Wish] = []
    for item in raw:
        try:
            wishes.append(Wish.model_validate(item))
        except ValidationError:
            continue

    return sorted(wishes, key=lambda wish: wish.updated_at, reverse=True)


def get_wish(guest_id: str, wish_id: str) -> Wish | None:
    with _LOCK:
        raw = _read_raw(guest_id)

    for item in raw:
        if item.get("id") != wish_id:
            continue
        try:
            return Wish.model_validate(item)
        except ValidationError:
            return None

    return None


def save_wish(guest_id: str, wish: Wish) -> Wish:
    with _LOCK:
        items = _read_raw(guest_id)
        items = [item for item in items if item.get("id") != wish.id]
        items.insert(0, wish.model_dump(by_alias=True))
        _write_raw(guest_id, items)

    return wish


def delete_wish(guest_id: str, wish_id: str) -> bool:
    with _LOCK:
        items = _read_raw(guest_id)
        kept = [item for item in items if item.get("id") != wish_id]
        if len(kept) == len(items):
            return False
        _write_raw(guest_id, kept)

    return True


# ── Создание и обновление ────────────────────────────────────


def new_wish(
    title: str,
    note: str | None,
    steps: Sequence[WishStep],
) -> Wish:
    now = _now()
    plan = clamp_plan(steps)

    return Wish(
        id=new_id("wish"),
        title=title.strip(),
        note=note.strip() if note and note.strip() else None,
        status=status_for(plan),
        progress=compute_progress(plan),
        steps=plan,
        created_at=now,
        updated_at=now,
    )


def _normalize_steps(steps: Sequence[WishStep]) -> list[WishStep]:
    result: list[WishStep] = []
    seen: set[str] = set()

    for step in list(steps)[:MAX_STORED_STEPS]:
        title = _SPACES.sub(" ", step.title).strip()
        if not title:
            continue

        step_id = step.id.strip()[:64] if step.id.strip() else new_id("step")
        while step_id in seen:
            step_id = new_id("step")

        seen.add(step_id)
        result.append(WishStep(id=step_id, title=title[:280], done=step.done))

    return result


def update_wish(guest_id: str, wish_id: str, patch: WishUpdate) -> Wish | None:
    with _LOCK:
        items = _read_raw(guest_id)

        for index, item in enumerate(items):
            if item.get("id") != wish_id:
                continue

            try:
                wish = Wish.model_validate(item)
            except ValidationError:
                return None

            fields = patch.model_fields_set
            changes: dict[str, object] = {}

            if "title" in fields and patch.title is not None:
                changes["title"] = patch.title.strip()
            if "note" in fields:
                note = patch.note.strip() if patch.note and patch.note.strip() else None
                changes["note"] = note

            if "steps" in fields and patch.steps is not None:
                steps = _normalize_steps(patch.steps)
                changes["steps"] = steps
                changes["progress"] = compute_progress(steps)
                changes["status"] = status_for(steps)
            elif "status" in fields and patch.status is not None:
                changes["status"] = patch.status
                if patch.status == "done":
                    steps = [step.model_copy(update={"done": True}) for step in wish.steps]
                    changes["steps"] = steps
                    changes["progress"] = compute_progress(steps)
                elif patch.status == "new" and wish.steps:
                    steps = [step.model_copy(update={"done": False}) for step in wish.steps]
                    changes["steps"] = steps
                    changes["progress"] = 0

            changes["updated_at"] = _now()
            updated = wish.model_copy(update=changes)
            items[index] = updated.model_dump(by_alias=True)
            _write_raw(guest_id, items)
            return updated

    return None


async def regenerate_plan(guest_id: str, wish_id: str) -> Wish | None:
    wish = get_wish(guest_id, wish_id)
    if wish is None:
        return None

    steps = await build_plan(wish.title, wish.note)

    with _LOCK:
        items = _read_raw(guest_id)
        for index, item in enumerate(items):
            if item.get("id") != wish_id:
                continue

            plan = clamp_plan(steps)
            updated = Wish.model_validate(item).model_copy(
                update={
                    "steps": plan,
                    "progress": compute_progress(plan),
                    "status": status_for(plan),
                    "updated_at": _now(),
                }
            )
            items[index] = updated.model_dump(by_alias=True)
            _write_raw(guest_id, items)
            return updated

    return None


# ── Генерация плана ──────────────────────────────────────────


def parse_plan(text: str) -> list[str]:
    """Достаёт шаги из нумерованного или маркированного списка."""
    result: list[str] = []
    seen: set[str] = set()

    for line in text.splitlines():
        match = _STEP_PREFIX.match(line)
        if not match:
            continue

        title = _SPACES.sub(" ", match.group(1)).strip(" *`_")
        if not (3 <= len(title) <= 200):
            continue

        key = title.casefold()
        if key in seen:
            continue

        seen.add(key)
        result.append(title)

        if len(result) == MAX_PLAN_STEPS:
            break

    return result if len(result) >= MIN_PLAN_STEPS else []


def offline_plan(title: str) -> list[WishStep]:
    """Детерминированный план на случай, если модели недоступны."""
    lower = title.casefold()

    if any(
        key in lower
        for key in ("код", "сайт", "прилож", "бот", "сервис", "программ", "проект", "mvp", "игр")
    ):
        titles = [
            "Опиши результат: что должно работать и для кого.",
            "Собери минимальный прототип на 30–60 минут.",
            "Вынеси задачи в короткий список и отметь первую.",
            "Проверь основной сценарий вручную.",
            "Зафиксируй следующий шаг и время на него.",
        ]
    elif any(
        key in lower
        for key in ("бег", "спорт", "заряд", "трениров", "похуд", "сон", "здоров")
    ):
        titles = [
            "Определи конкретную цель и удобное время.",
            "Подготовь всё нужное с вечера.",
            "Начни с 15 минут в лёгком темпе.",
            "Отметь выполненное и запиши самочувствие.",
            "Повтори завтра и не увеличивай нагрузку резко.",
        ]
    elif any(
        key in lower
        for key in ("учить", "англ", "язык", "экзамен", "курс", "читать", "книг")
    ):
        titles = [
            "Сформулируй, что именно хочешь освоить.",
            "Выбери один короткий урок или главу.",
            "Занимайся 15–25 минут без отвлечений.",
            "Проверь себя: перескажи или реши задачу.",
            "Назначь следующее занятие в календаре.",
        ]
    else:
        titles = [
            "Сформулируй результат одной фразой: что изменится и к какому сроку.",
            "Разбей путь на маленькие шаги по 15–30 минут.",
            "Выбери первый шаг и сделай его сегодня.",
            "Отметь выполненное и запиши, что помогло.",
            "Вернись через день и скорректируй план.",
        ]

    return [
        WishStep(id=new_id("step"), title=step, done=False)
        for step in titles[:MAX_PLAN_STEPS]
    ]


async def _ask_model(title: str, note: str | None) -> str:
    messages = [
        {"role": "system", "content": PLANNER_PROMPT},
        {
            "role": "user",
            "content": (
                f"Желание: {title}\n"
                f"Заметка: {note.strip() if note and note.strip() else '—'}\n"
                "Верни только нумерованный список шагов."
            ),
        },
    ]

    text, _provider = await complete_text(messages, settings=get_settings())
    return text


async def build_plan(title: str, note: str | None = None) -> list[WishStep]:
    """Пробует LLM, но всегда возвращает валидный план из 3–7 шагов."""
    text = ""
    try:
        text = await asyncio.wait_for(_ask_model(title, note), timeout=10)
    except (asyncio.TimeoutError, Exception):  # noqa: BLE001 - план не должен падать
        text = ""

    candidates = parse_plan(text)
    if len(candidates) >= MIN_PLAN_STEPS:
        return clamp_plan(
            [WishStep(id=new_id("step"), title=step, done=False) for step in candidates]
        )

    return offline_plan(title)
