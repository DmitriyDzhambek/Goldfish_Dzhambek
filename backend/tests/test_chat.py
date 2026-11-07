from __future__ import annotations

import json
from dataclasses import replace

from fastapi.testclient import TestClient

from backend.chat_history import (
    MAX_HISTORY_MESSAGES,
    ChatHistory,
    summarize_turns,
    trim_turns,
)
from backend.config import get_settings
from backend.providers import build_provider_chain, chunk_text, offline_reply
from backend.ratelimit import SlidingWindowLimiter


def test_history_is_persisted_after_stream(client: TestClient) -> None:
    session = "persisted-session"
    response = client.post(
        "/api/chat",
        json={"sessionId": session, "message": "Хочу начать бегать"},
    )
    assert response.status_code == 200

    data = json.loads(get_settings().data_path.read_text(encoding="utf-8"))
    turns = data["chats"][session]

    assert [turn["role"] for turn in turns] == ["user", "assistant"]
    assert turns[0]["content"] == "Хочу начать бегать"
    assert turns[1]["content"]


def test_history_trim_keeps_last_messages() -> None:
    turns = [
        {"role": "user", "content": f"сообщение {index}", "at": ""}
        for index in range(MAX_HISTORY_MESSAGES + 10)
    ]

    trimmed = trim_turns(turns)  # type: ignore[arg-type]

    assert len(trimmed) == MAX_HISTORY_MESSAGES
    assert trimmed[-1]["content"] == f"сообщение {MAX_HISTORY_MESSAGES + 9}"


def test_history_trim_respects_total_length() -> None:
    turns = [
        {"role": "user", "content": "я" * 1000, "at": ""} for _ in range(30)
    ]

    trimmed = trim_turns(turns)  # type: ignore[arg-type]

    assert len(trimmed) <= 16
    assert sum(len(turn["content"]) for turn in trimmed) <= 16_000


def test_history_is_summarized_when_trimmed() -> None:
    history = ChatHistory()

    for index in range(MAX_HISTORY_MESSAGES // 2 + 4):
        history.append("summary-session", "user", f"вопрос номер {index} про цель")
        history.append("summary-session", "assistant", f"ответ номер {index}")

    kept = history.get("summary-session")
    summary = history.get_summary("summary-session")

    assert len(kept) == MAX_HISTORY_MESSAGES
    assert "вопрос номер 0" not in kept[0]["content"]
    assert "Пользователь:" in summary
    assert "вопрос номер 0" in summary
    assert len(summary) <= 1800

    # Следующее сжатие не теряет прежнюю выжимку.
    history.append("summary-session", "user", "ещё один вопрос")
    assert "вопрос номер 0" in history.get_summary("summary-session")


def test_summarize_turns_keeps_last_lines() -> None:
    turns = [
        {"role": "user" if index % 2 == 0 else "assistant", "content": f"строка {index}", "at": ""}
        for index in range(40)
    ]

    summary = summarize_turns(turns)  # type: ignore[arg-type]

    assert "строка 39" in summary
    assert "строка 0" not in summary
    assert len(summary.splitlines()) <= 12


def test_offline_reply_is_chunked_without_losing_text() -> None:
    text = offline_reply("fish")

    assert "".join(chunk_text(text)) == text
    assert "15 минут" in text


def test_provider_chain_order() -> None:
    settings = get_settings()
    assert [provider.name for provider in build_provider_chain(settings)] == ["ollama"]

    configured = replace(
        settings,
        llm_base_url="https://primary.example/v1",
        llm_model="primary-model",
        llm_fallback_base_url="https://fallback.example/v1",
        llm_fallback_model="fallback-model",
    )

    assert [provider.name for provider in build_provider_chain(configured)] == [
        "primary",
        "fallback",
        "ollama",
    ]


def test_rate_limiter_blocks_after_limit() -> None:
    limiter = SlidingWindowLimiter(2)

    assert limiter.allow("client-a")
    assert limiter.allow("client-a")
    assert not limiter.allow("client-a")
    assert limiter.allow("client-b")
