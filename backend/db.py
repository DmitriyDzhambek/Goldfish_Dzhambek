"""Слой данных.

MVP: атомарная запись в JSON-файл (как в «Колобке»).
Прод: PostgreSQL по DATABASE_URL — интерфейс останется тем же,
поменяется только реализация репозиториев.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

from backend.config import get_settings


class JsonStore:
    """Небольшое потокобезопасное key-value хранилище в одном JSON-файле."""

    def __init__(self, path: Path) -> None:
        self._path = path
        self._lock = Lock()

    @property
    def path(self) -> Path:
        return self._path

    def read(self) -> dict[str, Any]:
        with self._lock:
            return self._read_unlocked()

    def write(self, data: dict[str, Any]) -> None:
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(
                dir=self._path.parent,
                prefix=f".{self._path.name}.",
                suffix=".tmp",
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                    json.dump(data, handle, ensure_ascii=False, indent=2)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary, self._path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)

    def _read_unlocked(self) -> dict[str, Any]:
        try:
            with self._path.open(encoding="utf-8") as handle:
                data = json.load(handle)
        except FileNotFoundError:
            return {}
        except json.JSONDecodeError:
            # Повреждённый файл не должен ронять сервис.
            return {}

        return data if isinstance(data, dict) else {}


def get_store() -> JsonStore:
    return JsonStore(get_settings().data_path)
