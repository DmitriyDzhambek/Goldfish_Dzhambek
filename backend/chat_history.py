"""История диалога: последние реплики сессии в общем JSON-хранилище.

Храним только роль, текст и время. Историю обрезаем по количеству сообщений
и по суммарной длине, чтобы промт не разрастался бесконечно.
"""

from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Literal, TypedDict

from backend.db import JsonStore, get_store
from backend.llm import ChatMessage

ChatRole = Literal["user", "assistant"]

MAX_HISTORY_MESSAGES = 24
MAX_HISTORY_CHARS = 16_000


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


class ChatHistory:
    """Потокобезопасная история поверх JsonStore."""

    def __init__(self, store: JsonStore | None = None) -> None:
        self._store = store or get_store()
        self._lock = Lock()

    def get(self, session_id: str) -> list[ChatMessage]:
        with self._lock:
            turns = self._read_turns(session_id)

        return [{"role": turn["role"], "content": turn["content"]} for turn in turns]

    def append(self, session_id: str, role: ChatRole, content: str) -> None:
        if not content:
            return

        with self._lock:
            data = self._store.read()
            chats = data.get("chats")
            if not isinstance(chats, dict):
                chats = {}
                data["chats"] = chats

            turns = self._read_turns(session_id, data)
            turns.append({"role": role, "content": content, "at": _now()})
            chats[session_id] = trim_turns(turns)
            self._store.write(data)

    def _read_turns(
        self, session_id: str, data: dict[str, object] | None = None
    ) -> list[StoredTurn]:
        source = data if data is not None else self._store.read()
        chats = source.get("chats")
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

        return trim_turns(turns)
