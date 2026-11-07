"""История диалога: последние реплики сессии в общем JSON-хранилище.

Храним только роль, текст и время. Историю обрезаем по количеству сообщений
и по суммарной длине, чтобы промт не разрастался бесконечно.

Когда старые реплики выпадают из окна, из них собирается короткая выжимка.
Она не даёт рыбке «забыть» имя, цель или договорённости после длинного
разговора — и при этом не раздувает каждый запрос.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from threading import Lock
from typing import Literal, TypedDict

from backend.db import JsonStore, get_store
from backend.llm import ChatMessage

ChatRole = Literal["user", "assistant"]

MAX_HISTORY_MESSAGES = 24
MAX_HISTORY_CHARS = 16_000
MAX_SUMMARY_CHARS = 1800
MAX_SUMMARY_LINE = 180
MAX_SUMMARY_LINES = 12

CHATS_KEY = "chats"
SUMMARIES_KEY = "chat_summaries"
_SPACES = re.compile(r"\s+")


class StoredTurn(TypedDict):
    role: ChatRole
    content: str
    at: str


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_turn(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    role = value.get("role")
    content = value.get("content")
    return role in ("user", "assistant") and isinstance(content, str) and bool(content)


def trim_turns(turns: list[StoredTurn]) -> list[StoredTurn]:
    """Оставляет последние сообщения в пределах лимитов, не разрывая диалог."""
    trimmed = turns[-MAX_HISTORY_MESSAGES:]

    total = 0
    kept: list[StoredTurn] = []
    for turn in reversed(trimmed):
        length = len(turn["content"])
        if kept and total + length > MAX_HISTORY_CHARS:
            break
        kept.append(turn)
        total += length

    kept.reverse()
    return kept


def summarize_turns(turns: list[StoredTurn], previous: str = "") -> str:
    """Сжимает выпавшие реплики в несколько коротких строк."""
    lines: list[str] = []

    for turn in turns[-MAX_SUMMARY_LINES:]:
        text = _SPACES.sub(" ", turn["content"]).strip()
        if not text:
            continue
        speaker = "Пользователь" if turn["role"] == "user" else "Рыбка"
        lines.append(f"{speaker}: {text[:MAX_SUMMARY_LINE]}")

    fresh = "\n".join(lines).strip()
    combined = f"{previous.strip()}\n{fresh}".strip() if previous.strip() else fresh
    return combined[-MAX_SUMMARY_CHARS:]


class ChatHistory:
    """Потокобезопасная история и выжимка поверх JsonStore."""

    def __init__(self, store: JsonStore | None = None) -> None:
        self._store = store or get_store()
        self._lock = Lock()

    def get(self, session_id: str) -> list[ChatMessage]:
        with self._lock:
            turns = self._read_turns(session_id)

        return [{"role": turn["role"], "content": turn["content"]} for turn in turns]

    def get_summary(self, session_id: str) -> str:
        with self._lock:
            data = self._store.read()
            summaries = data.get(SUMMARIES_KEY)
            if not isinstance(summaries, dict):
                return ""

            raw = summaries.get(session_id)
            if not isinstance(raw, dict):
                return ""
            return str(raw.get("text") or "")[:MAX_SUMMARY_CHARS]

    def append(self, session_id: str, role: ChatRole, content: str) -> None:
        if not content:
            return

        with self._lock:
            data = self._store.read()
            chats = data.get(CHATS_KEY)
            if not isinstance(chats, dict):
                chats = {}
                data[CHATS_KEY] = chats

            raw_turns = self._read_raw_turns(session_id, data)
            raw_turns.append({"role": role, "content": content, "at": _now()})

            kept = trim_turns(raw_turns)
            chats[session_id] = kept

            removed = raw_turns[: len(raw_turns) - len(kept)]
            if removed:
                summaries = data.get(SUMMARIES_KEY)
                if not isinstance(summaries, dict):
                    summaries = {}
                    data[SUMMARIES_KEY] = summaries

                previous = ""
                old = summaries.get(session_id)
                if isinstance(old, dict):
                    previous = str(old.get("text") or "")

                summaries[session_id] = {
                    "text": summarize_turns(removed, previous),
                    "updatedAt": _now(),
                }

            self._store.write(data)

    def _read_turns(
        self, session_id: str, data: dict[str, object] | None = None
    ) -> list[StoredTurn]:
        return trim_turns(self._read_raw_turns(session_id, data))

    def _read_raw_turns(
        self, session_id: str, data: dict[str, object] | None = None
    ) -> list[StoredTurn]:
        source = data if data is not None else self._store.read()
        chats = source.get(CHATS_KEY)
        if not isinstance(chats, dict):
            return []

        raw = chats.get(session_id)
        if not isinstance(raw, list):
            return []

        turns: list[StoredTurn] = []
        for item in raw:
            if _is_turn(item):
                turns.append(
                    {
                        "role": item["role"],
                        "content": str(item["content"]),
                        "at": str(item.get("at", "")),
                    }
                )

        return turns
