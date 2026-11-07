"""Общие фикстуры тестов. Запуск: python -m pytest backend/tests -q"""

from __future__ import annotations

import os
import sys
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Тесты не должны трогать реальные данные и реальные LLM-провайдеры.
os.environ["DATA_DIR"] = tempfile.mkdtemp(prefix="zr-tests-")
os.environ["LLM_BASE_URL"] = ""
os.environ["LLM_API_KEY"] = ""
os.environ["LLM_MODEL"] = ""
os.environ["LLM_FALLBACK_BASE_URL"] = ""
os.environ["LLM_FALLBACK_API_KEY"] = ""
os.environ["LLM_FALLBACK_MODEL"] = ""
os.environ["OLLAMA_BASE_URL"] = "http://127.0.0.1:9/v1"
os.environ["OLLAMA_MODEL"] = "test-offline"
os.environ["RATE_LIMIT_PER_MINUTE"] = "1000"

from backend.main import app  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
