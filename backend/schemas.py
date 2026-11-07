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
VibeMode = Literal["generate", "explain"]
VibeSource = Literal["folder", "github", "demo", "none"]


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


ChatMode = Literal["chat", "diary"]


class ChatRequest(ApiModel):
    session_id: str = Field(min_length=1, max_length=128)
    message: str = Field(min_length=1, max_length=8000)
    character: Character = "fish"
    wish_id: str | None = Field(default=None, max_length=128)
    mode: ChatMode = "chat"


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


# ── Вайбкодинг ───────────────────────────────────────────────


class ProjectFile(ApiModel):
    """Файл проекта, который браузер прочитал локально и прислал на анализ.

    Сервер не имеет доступа к диску: он видит только то, что пользователь
    явно выбрал в браузере.
    """

    path: str = Field(min_length=1, max_length=400)
    content: str = Field(default="", max_length=200_000)
    language: str | None = Field(default=None, max_length=40)


class VibeRequest(ApiModel):
    task: str = Field(min_length=3, max_length=8000)
    mode: VibeMode = "generate"
    source: VibeSource = "none"
    repo: str | None = Field(default=None, max_length=300)
    files: list[ProjectFile] = Field(default_factory=list, max_length=60)


class VibeStep(ApiModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field(default="", max_length=2000)
    files: list[str] = Field(default_factory=list, max_length=12)


class VibeChange(ApiModel):
    path: str = Field(min_length=1, max_length=400)
    language: str | None = Field(default=None, max_length=40)
    code: str = Field(default="", max_length=40_000)
    explanation: str = Field(default="", max_length=4000)


class VibeResponse(ApiModel):
    mode: VibeMode
    summary: str = Field(min_length=1, max_length=4000)
    relevant_files: list[str] = Field(default_factory=list, max_length=20)
    steps: list[VibeStep] = Field(default_factory=list, max_length=12)
    changes: list[VibeChange] = Field(default_factory=list, max_length=8)
    warnings: list[str] = Field(default_factory=list, max_length=12)
    provider: str | None = Field(default=None, max_length=32)


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


class Account(ApiModel):
    id: str
    name: str
    email: str | None = None
    avatar_url: str | None = None
    created_at: str


class AuthMe(ApiModel):
    authenticated: bool = False
    account: Account | None = None
    oauth_enabled: bool = False
    provider: Literal["yandex"] = "yandex"
    guest: bool = True


class TransferSummary(ApiModel):
    wishes: int = 0
    facts: int = 0
