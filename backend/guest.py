"""Гостевая идентификация.

У проекта нет обязательной регистрации, поэтому желания привязываются
к анонимному идентификатору, который клиент хранит в localStorage
и присылает в заголовке `X-Guest-Id`.
"""

from __future__ import annotations

import re

from fastapi import Request

GUEST_HEADER = "X-Guest-Id"
DEFAULT_GUEST = "guest-default"

_GUEST_RE = re.compile(r"^[A-Za-z0-9_-]{8,128}$")


def get_guest_id(request: Request) -> str:
    """Возвращает безопасный идентификатор гостя или общий fallback."""
    raw = request.headers.get(GUEST_HEADER, "").strip()
    return raw if _GUEST_RE.fullmatch(raw) else DEFAULT_GUEST
