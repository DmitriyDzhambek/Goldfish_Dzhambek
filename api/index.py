"""Точка входа FastAPI для Vercel Python Runtime.

Vercel переписывает запросы /api/(.*) на эту функцию (см. vercel.json).
Если после rewrite функция видит путь /api/index вместо исходного,
восстанавливаем исходный путь из заголовков Vercel, чтобы маршруты
FastAPI (/api/health, /api/chat и т.д.) работали как обычно.
"""

from __future__ import annotations

from typing import Any

from backend.main import app  # noqa: F401 — Vercel ищет переменную `app`

_FUNCTION_PATHS = {"/api", "/api/index", "/api/index.py"}
_ORIGINAL_PATH_HEADERS = (
    b"x-forwarded-uri",
    b"x-matched-path",
    b"x-original-uri",
)


class _VercelPathMiddleware:
    """Восстанавливает исходный путь запроса после Vercel-rewrite."""

    def __init__(self, asgi_app: Any) -> None:
        self._asgi_app = asgi_app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope["type"] == "http" and scope.get("path") in _FUNCTION_PATHS:
            headers = {name: value for name, value in scope.get("headers", [])}
            original: str | None = None
            for header_name in _ORIGINAL_PATH_HEADERS:
                raw = headers.get(header_name)
                if raw:
                    original = raw.decode("latin-1").split("?")[0]
                    break
            if original and original.startswith("/api/") and original != scope["path"]:
                scope = dict(scope)
                scope["path"] = original
                scope["raw_path"] = original.encode()
        await self._asgi_app(scope, receive, send)


app.add_middleware(_VercelPathMiddleware)
