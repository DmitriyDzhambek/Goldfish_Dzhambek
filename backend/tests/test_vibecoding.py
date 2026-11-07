from __future__ import annotations

from fastapi.testclient import TestClient

from backend.schemas import ProjectFile, VibeRequest
from backend.vibecoding import (
    clean_files,
    detect_language,
    is_sensitive_path,
    rank_files,
)

FILES = [
    {
        "path": "src/api/client.ts",
        "content": (
            "export async function requestJson<T>(url: string): Promise<T> {\n"
            "  const response = await fetch(url)\n"
            "  return (await response.json()) as T\n"
            "}\n"
        ),
        "language": "typescript",
    },
    {
        "path": "src/pages/ChatPage.tsx",
        "content": (
            "export function ChatPage() {\n"
            "  return <form><input name=\"message\" /><button type=\"submit\">Отправить</button></form>\n"
            "}\n"
        ),
    },
    {
        "path": "src/styles/chat.css",
        "content": ".chat { display: grid; gap: 12px; }\n",
    },
]


def test_secrets_and_noise_are_skipped() -> None:
    warnings: list[str] = []
    files = clean_files(
        [
            ProjectFile(path=".env", content="LLM_API_KEY=secret"),
            ProjectFile(path="config/secrets.json", content="{}"),
            ProjectFile(path="node_modules/pkg/index.js", content="module.exports = 1"),
            ProjectFile(path="keys/server.pem", content="-----BEGIN-----"),
            ProjectFile(path="../escape.py", content="print(1)"),
            ProjectFile(path="src/app.ts", content="export const app = 1"),
        ],
        warnings,
    )

    assert [file.path for file in files] == ["src/app.ts"]
    assert any(".env" in warning for warning in warnings)
    assert any("secrets.json" in warning for warning in warnings)


def test_sensitive_path_detection() -> None:
    assert is_sensitive_path(".env")
    assert is_sensitive_path("deploy/.env.production")
    assert is_sensitive_path("cert/server.key")
    assert is_sensitive_path("node_modules/react/index.js")
    assert not is_sensitive_path("src/api/client.ts")
    assert not is_sensitive_path("README.md")


def test_language_detection_by_extension() -> None:
    assert detect_language("src/App.tsx") == "tsx"
    assert detect_language("backend/main.py") == "python"
    assert detect_language("Dockerfile") == "dockerfile"
    assert detect_language("LICENSE") is None
    assert detect_language("assets/logo.png", "image") == "image"


def test_rank_files_prefers_task_matches() -> None:
    warnings: list[str] = []
    files = clean_files([ProjectFile(**item) for item in FILES], warnings)

    ranked = rank_files("Добавь валидацию формы в ChatPage", files)

    assert ranked[0].path == "src/pages/ChatPage.tsx"

    api_ranked = rank_files("исправь запрос fetch в api client", files)
    assert api_ranked[0].path == "src/api/client.ts"


def test_analyze_without_files_is_honest_offline_plan(client: TestClient) -> None:
    response = client.post(
        "/api/vibecoding/analyze",
        json={"task": "Добавь кнопку сохранения", "mode": "generate", "files": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "generate"
    assert body["steps"]
    assert len(body["steps"]) <= 12
    assert body["changes"] == []
    assert body["provider"] is None
    assert any("Файлы не добавлены" in warning for warning in body["warnings"])


def test_analyze_generates_code_without_llm(client: TestClient) -> None:
    response = client.post(
        "/api/vibecoding/analyze",
        json={
            "task": "Добавь кнопку отправки формы в ChatPage",
            "mode": "generate",
            "source": "folder",
            "files": FILES,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["steps"]
    assert body["changes"]
    assert all(change["path"] in {item["path"] for item in FILES} for change in body["changes"])
    assert any("ChatPage" in path for path in body["relevantFiles"])
    assert any("офлайн" in warning.lower() for warning in body["warnings"])
    assert body["provider"] is None


def test_analyze_explain_mode_returns_walkthrough(client: TestClient) -> None:
    response = client.post(
        "/api/vibecoding/analyze",
        json={
            "task": "Объясни, как ChatPage отправляет сообщения",
            "mode": "explain",
            "files": FILES,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "explain"
    assert body["changes"]
    assert all(change["explanation"] for change in body["changes"])
    assert any("ChatPage" in change["path"] for change in body["changes"])


def test_analyze_validation_uses_same_envelope(client: TestClient) -> None:
    response = client.post("/api/vibecoding/analyze", json={"task": "a", "files": []})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_vibe_request_limits_file_count() -> None:
    too_many = [ProjectFile(path=f"src/file-{index}.ts", content="") for index in range(61)]

    try:
        VibeRequest(task="Проверь проект", files=too_many)
    except ValueError:
        pass
    else:  # pragma: no cover - защита от регрессии
        raise AssertionError("ожидалась ошибка валидации количества файлов")
