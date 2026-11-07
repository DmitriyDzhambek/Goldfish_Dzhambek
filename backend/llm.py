"""Характер рыбки и будущая цепочка моделей.

Порядок на этапе 2:
  основной провайдер → бесплатный fallback → локальная Ollama → офлайн-ответы.
Пока здесь только системный промт и сборка сообщений — сетевых вызовов нет.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal, TypedDict

Character = Literal["fish", "kolobok"]

GOLDFISH_SYSTEM_PROMPT = (
    "Ты — Золотая Рыбка из сказки Пушкина. Твой образ: мудрая, спокойная, "
    "немного ироничная. Ты не сюсюкаешь. Ты общаешься на 'ты' по имени (если известно). "
    "Твоя задача — помогать пользователю делать дела самому, а не делать всё за него. "
    "Ты используешь фразы-маркеры ('Чего изволите?', 'Ступай, я подскажу', "
    "'Волна несёт ответ...') очень редко, как приправу. Максимум 1-2 эмодзи на сообщение "
    "(🌊, 🐠, ✨). Ты всегда связываешь ответы с продуктивностью, заработком или саморазвитием."
)

KOLOBOK_SYSTEM_PROMPT = (
    "Ты — Колобок: тёплый, любопытный и немного хитрый помощник. "
    "Ты общаешься на 'ты', говоришь просто и по делу, не сюсюкаешь. "
    "Помогаешь пользователю самому доводить дела до конца, а не делаешь всё за него. "
    "Максимум 1-2 эмодзи на сообщение. Связывай ответы с продуктивностью и развитием."
)

# Ограничение длины памяти в промте: больше фактов — дороже каждый запрос.
MAX_PROMPT_FACTS = 40


class ChatMessage(TypedDict):
    role: Literal["system", "user", "assistant"]
    content: str


def build_system_prompt(
    *,
    character: Character = "fish",
    user_name: str | None = None,
    facts: Sequence[str] = (),
) -> str:
    """Собирает системный промт: характер + имя + память."""
    base = GOLDFISH_SYSTEM_PROMPT if character == "fish" else KOLOBOK_SYSTEM_PROMPT

    lines = [base]
    if user_name:
        lines.append(f"Пользователя зовут {user_name}.")
    if facts:
        lines.append("Что ты помнишь о пользователе (используй уместно, не пересказывай списком):")
        lines.extend(f"- {fact}" for fact in facts[:MAX_PROMPT_FACTS])

    return "\n".join(lines)


def build_messages(
    *,
    system_prompt: str,
    history: Sequence[ChatMessage],
    user_message: str,
) -> list[ChatMessage]:
    """Готовит сообщения для OpenAI-совместимого API."""
    messages: list[ChatMessage] = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})
    return messages
