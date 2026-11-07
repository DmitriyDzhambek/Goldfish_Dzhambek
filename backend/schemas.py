"""Pydantic-схемы = контракт между фронтендом и бэкендом.

Клиент работает в camelCase, Python — в snake_case. Переводим автоматически,
не дублируя имена полей вручную.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from backend.llm import Character

WishStatus = Literal["new", "in_progress", "done"]
MemoryKind = Literal["name", "goal", "habit", "date", "other"]


class ApiModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class ErrorDetail(ApiModel):
    code: str
    message: str


class ErrorResponse(ApiModel):
    error: ErrorDetail


# ── Чат ──────────────────────────────────────────────────────


class ChatRequest(ApiModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=8000)
    character: Character = "fish"
    wish_id: str | None = Field(default=None, max_length=128)


class ChatUsage(ApiModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None


# ── Желания ──────────────────────────────────────────────────


class WishStep(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=280)
    done: bool = False


class Wish(ApiModel):
    id: str
    title: str = Field(min_length=1, max_length=280)
    note: str | None = Field(default=None, max_length=4000)
    status: WishStatus = "new"
    progress: int = Field(default=0, ge=0, le=100)
    steps: list[WishStep] = Field(default_factory=list)
    created_at: str
    updated_at: str


class WishCreate(ApiModel):
    title: str = Field(min_length=1, max_length=280)
    note: str | None = Field(default=None, max_length=4000)


class WishUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=1, max_length=280)
    note: str | None = Field(default=None, max_length=4000)
    status: WishStatus | None = None
    steps: list[WishStep] | None = Field(default=None, max_length=32)


class WishList(ApiModel):
    wishes: list[Wish] = Field(default_factory=list)


# ── Память ───────────────────────────────────────────────────


class MemoryFact(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    kind: MemoryKind
    value: str = Field(min_length=1, max_length=2000)
    created_at: str


class MemorySnapshot(ApiModel):
    facts: list[MemoryFact] = Field(default_factory=list)
    updated_at: str | None = None


class MemoryUpdate(ApiModel):
    facts: list[MemoryFact] = Field(default_factory=list, max_length=200)


# ── Авторизация ──────────────────────────────────────────────


class EmailRequest(ApiModel):
    email: str = Field(
        min_length=3,
        max_length=254,
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$",
    )


class RequestAccepted(ApiModel):
    status: Literal["sent"] = "sent"
    message: str
