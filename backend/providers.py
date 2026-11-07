"""Провайдеры LLM и цепочка fallback.

Порядок: основной провайдер → бесплатный резерв → локальная Ollama → офлайн.
Все ключи остаются на сервере, наружу уходит только текст ответа.

Формат провайдера — любой OpenAI-совместимый `/chat/completions`
(OpenAI, OpenRouter, Groq, Gemini-совместимые шлюзы, Ollama).
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator, Iterable, Iterator, Sequence
from dataclasses import dataclass
from typing import Literal

import httpx

from backend.config import Settings
from backend.llm import ChatMessage

ProviderName = Literal["primary", "fallback", "ollama", "offline"]

LOCAL_NOTICE = "Рыбка нырнула глубже — отвечает локальная модель"
OFFLINE_NOTICE = "Рыбка нырнула глубже — отвечает офлайн-режим"

# Таймауты: быстро отваливаемся, если локальной модели нет,
# но даём достаточно времени на «холодный» старт Ollama.
_HTTP_TIMEOUT = httpx.Timeout(connect=2.0, read=90.0, write=10.0, pool=5.0)


class ProviderError(Exception):
    """Провайдер недоступен: можно пробовать следующий."""


@dataclass(frozen=True, slots=True)
class Provider:
    name: ProviderName
    base_url: str
    api_key: str
    model: str
    local: bool = False


@dataclass(slots=True)
class StreamEvent:
    delta: str | None = None
    notice: str | None = None
    provider: ProviderName | None = None
    done: bool = False
    error: str | None = None


def build_provider_chain(settings: Settings) -> list[Provider]:
    chain: list[Provider] = []

    if settings.llm_base_url and settings.llm_model:
        chain.append(
            Provider(
                name="primary",
                base_url=settings.llm_base_url,
                api_key=settings.llm_api_key,
                model=settings.llm_model,
            )
        )

    if settings.llm_fallback_base_url and settings.llm_fallback_model:
        chain.append(
            Provider(
                name="fallback",
                base_url=settings.llm_fallback_base_url,
                api_key=settings.llm_fallback_api_key,
                model=settings.llm_fallback_model,
            )
        )

    if settings.ollama_base_url and settings.ollama_model:
        chain.append(
            Provider(
                name="ollama",
                base_url=settings.ollama_base_url,
                api_key="",
                model=settings.ollama_model,
                local=True,
            )
        )

    return chain


def _endpoint(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def _extract_delta(raw: str) -> str | None:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ProviderError("Провайдер прислал некорректный поток") from exc

    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    first = choices[0]
    if not isinstance(first, dict):
        return None

    delta = first.get("delta")
    if not isinstance(delta, dict):
        return None

    content = delta.get("content")
    return content if isinstance(content, str) and content else None


async def stream_provider(
    provider: Provider,
    messages: Sequence[ChatMessage],
    *,
    temperature: float = 0.8,
) -> AsyncIterator[str]:
    """Стримит текст от одного OpenAI-совместимого провайдера."""
    headers = {"Accept": "text/event-stream"}
    if provider.api_key:
        headers["Authorization"] = f"Bearer {provider.api_key}"

    body = {
        "model": provider.model,
        "messages": list(messages),
        "stream": True,
        "temperature": temperature,
    }

    try:
        async with httpx.AsyncClient(
            timeout=_HTTP_TIMEOUT,
            follow_redirects=True,
        ) as client:
            async with client.stream(
                "POST",
                _endpoint(provider.base_url),
                json=body,
                headers=headers,
            ) as response:
                if response.status_code >= 400:
                    raise ProviderError(
                        f"{provider.name}: HTTP {response.status_code}"
                    )

                async for line in response.aiter_lines():
                    if not line.startswith("data:"):
                        continue

                    raw = line[5:].strip()
                    if not raw:
                        continue
                    if raw == "[DONE]":
                        return

                    delta = _extract_delta(raw)
                    if delta:
                        yield delta
    except httpx.HTTPError as exc:
        raise ProviderError(f"{provider.name}: {type(exc).__name__}") from exc


def chunk_text(text: str, *, size: int = 28) -> Iterator[str]:
    """Режет офлайн-ответ на короткие куски, чтобы он тоже «тёк»."""
    buffer = ""
    for word in re.findall(r"\S+\s*", text):
        if buffer and len(buffer) + len(word) > size:
            yield buffer
            buffer = word
        else:
            buffer += word

    if buffer:
        yield buffer


def offline_reply(character: str) -> str:
    first_line = (
        "Слышу тебя, странник. Глубокая связь сейчас недоступна, поэтому отвечу "
        "по памяти — коротко и по делу."
        if character == "fish"
        else "Слышу тебя. Глубокая связь сейчас недоступна, поэтому отвечу по памяти — коротко и по делу."
    )

    return (
        f"{first_line}\n\n"
        "Предлагаю сузить желание до одного шага:\n"
        "1. Сформулируй результат одной фразой: что должно измениться и к какому сроку.\n"
        "2. Выбери действие на 15 минут, которое можно сделать уже сегодня.\n"
        "3. Назначь точное время и вернись с отчётом — я помогу не свернуть.\n\n"
        "Начни с фразы «Я хочу ... к ...». А я разложу это на шаги."
    )


async def complete_text(
    messages: Sequence[ChatMessage],
    *,
    settings: Settings,
    temperature: float = 0.8,
) -> tuple[str, ProviderName | None]:
    """Нестриминговый ответ для служебных задач (например, план желания).

    Возвращает `(текст, провайдер)` или `("", None)`, если все провайдеры
    недоступны. Офлайн-шаблон добавляет вызывающий код — здесь мы не
    подменяем план текстом чата.
    """
    for provider in build_provider_chain(settings):
        chunks: list[str] = []

        try:
            async for delta in stream_provider(provider, messages, temperature=temperature):
                chunks.append(delta)
        except ProviderError:
            continue
        except Exception:  # noqa: BLE001 - служебный вызов не должен ронять API
            continue

        text = "".join(chunks).strip()
        if text:
            return text, provider.name

    return "", None


async def stream_with_fallback(
    messages: Sequence[ChatMessage],
    *,
    settings: Settings,
    character: str = "fish",
) -> AsyncIterator[StreamEvent]:
    """Идёт по цепочке провайдеров и всегда заканчивается ответом."""
    chain: Iterable[Provider] = build_provider_chain(settings)

    for provider in chain:
        notice = None if provider.name in ("primary", "fallback") else LOCAL_NOTICE
        started = False

        try:
            async for delta in stream_provider(provider, messages):
                if not started:
                    started = True
                    if notice:
                        yield StreamEvent(notice=notice, provider=provider.name)
                yield StreamEvent(delta=delta, provider=provider.name)
        except ProviderError:
            if started:
                # Часть ответа уже ушла клиенту — аккуратно завершаем.
                yield StreamEvent(
                    error="Связь с глубиной оборвалась. Попробуй ещё раз.",
                    provider=provider.name,
                )
                return
            continue
        except Exception:
            if started:
                yield StreamEvent(
                    error="Связь с глубиной оборвалась. Попробуй ещё раз.",
                    provider=provider.name,
                )
                return
            continue

        if started:
            yield StreamEvent(done=True, provider=provider.name)
            return

    # Последний рубеж: офлайн-ответ. Работает без ключей и без интернета.
    yield StreamEvent(notice=OFFLINE_NOTICE, provider="offline")
    for chunk in chunk_text(offline_reply(character)):
        yield StreamEvent(delta=chunk, provider="offline")
    yield StreamEvent(done=True, provider="offline")
