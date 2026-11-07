"""Характер рыбки и сборка сообщений для LLM.

Порядок провайдеров на этапе 2:
  основной провайдер → бесплатный fallback → локальная Ollama → офлайн-ответы.
Сетевые вызовы живут в backend/providers.py, здесь — только промт.
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

DIARY_SYSTEM_PROMPT = (
    "Ты — мудрая Золотая Рыбка. Пользователь ведёт дневник, ты читаешь его записи. "
    "Если это личные переживания — поддержи его одной мудрой фразой. "
    "Если это ИДЕЯ для проекта — предложи конкретный следующий шаг "
    "(архитектуру, план или код), чтобы он мог продолжить. "
    "Будь краток (до 3 предложений), ироничен, но полезен."
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
    context: Sequence[str] = (),
    diary: bool = False,
) -> str:
    """Собирает системный промт: характер + имя + память + контекст.

    `diary=True` — режим дневника: краткий отклик Рыбки на запись
    вместо привычного диалога.
    """
    if diary:
        base = DIARY_SYSTEM_PROMPT
    else:
        base = GOLDFISH_SYSTEM_PROMPT if character == "fish" else KOLOBOK_SYSTEM_PROMPT

    lines = [base]
    if user_name:
        lines.append(f"Пользователя зовут {user_name}.")
    if facts:
        lines.append("Что ты помнишь о пользователе (используй уместно, не пересказывай списком):")
        lines.extend(f"- {fact}" for fact in facts[:MAX_PROMPT_FACTS])
    if context:
        lines.append("Контекст текущего разговора (учитывай, но не цитируй целиком):")
        lines.extend(f"- {line}" for line in context if line.strip())

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
