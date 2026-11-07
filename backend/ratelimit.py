"""Мягкий анти-абьюзный лимит запросов.

Это не продуктовый лимит: сообщения, желания и сессии остаются безлимитными.
Ограничение защищает сервер и бесплатные ключи от случайных или злонамеренных
всплесков. Значение задаётся через RATE_LIMIT_PER_MINUTE.
"""

from __future__ import annotations

from collections import defaultdict, deque
from functools import lru_cache
from threading import Lock
from time import monotonic

from backend.config import get_settings


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float = 60.0) -> None:
        self._limit = max(1, limit)
        self._window = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def allow(self, key: str) -> bool:
        now = monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] >= self._window:
                hits.popleft()

            if len(hits) >= self._limit:
                return False

            hits.append(now)
            return True


@lru_cache(maxsize=1)
def get_limiter() -> SlidingWindowLimiter:
    return SlidingWindowLimiter(get_settings().rate_limit_per_minute)
