"""Вайбкодинг: анализ проекта и последовательное решение задачи.

Сервер не читает диск и не ходит в GitHub за пользователя. Браузер сам
показывает папку или импортирует публичный репозиторий и присылает только
выбранные файлы. Здесь мы фильтруем секреты, ранжируем файлы, строим промт
и всегда возвращаем валидный план — даже без LLM.
"""

from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Sequence
from uuid import uuid4

from backend.config import Settings
from backend.providers import complete_text
from backend.schemas import (
    ProjectFile,
    VibeChange,
    VibeRequest,
    VibeResponse,
    VibeStep,
)

MAX_CONTEXT_FILES = 10
MAX_STORED_FILE = 80_000
MAX_PROMPT_FILE = 6000
MAX_PROMPT_TOTAL = 36_000
MAX_CHANGES = 4
MAX_WARNINGS = 8

_SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".venv",
    "venv",
    "__pycache__",
    ".next",
    ".nuxt",
    ".cache",
    ".idea",
    ".vscode",
}
_SENSITIVE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".npmrc",
    ".pypirc",
    "id_rsa",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "credentials",
    "credentials.json",
    "secrets.json",
    "secret.json",
}
_SENSITIVE_SUFFIXES = (".pem", ".key", ".p12", ".pfx", ".keystore", ".jks")
_WORD = re.compile(r"[A-Za-zА-Яа-яЁё0-9_]{2,}")
_SPACES = re.compile(r"\s+")

_STOP_WORDS = {
    "и",
    "в",
    "во",
    "на",
    "с",
    "со",
    "по",
    "для",
    "как",
    "что",
    "это",
    "или",
    "из",
    "к",
    "у",
    "о",
    "об",
    "не",
    "но",
    "а",
    "же",
    "бы",
    "мне",
    "мой",
    "моя",
    "моё",
    "надо",
    "нужно",
    "сделай",
    "добавь",
    "давай",
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "you",
    "your",
    "from",
    "into",
    "please",
    "make",
    "add",
}

LANGUAGE_BY_EXT = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "jsx",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".css": "css",
    ".scss": "scss",
    ".html": "html",
    ".json": "json",
    ".md": "markdown",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".sh": "bash",
    ".ps1": "powershell",
    ".go": "go",
    ".rs": "rust",
    ".java": "java",
    ".kt": "kotlin",
    ".swift": "swift",
    ".php": "php",
    ".rb": "ruby",
    ".vue": "vue",
    ".svelte": "svelte",
}

ENTRYPOINT_NAMES = {
    "readme.md",
    "package.json",
    "pyproject.toml",
    "requirements.txt",
    "dockerfile",
    "makefile",
    "vite.config.ts",
    "tsconfig.json",
}


def _new_id() -> str:
    return f"vibe-{uuid4().hex[:10]}"


def _normalize_path(path: str) -> str:
    cleaned = path.replace("\\", "/").strip().lstrip("/")
    parts = [part for part in cleaned.split("/") if part and part != "."]
    if not parts or any(part == ".." for part in parts):
        return ""
    return "/".join(parts)[:400]


def is_sensitive_path(path: str) -> bool:
    normalized = path.replace("\\", "/").casefold()
    parts = normalized.split("/")
    name = parts[-1] if parts else ""

    if any(part in _SKIP_DIRS for part in parts[:-1]):
        return True
    if name in _SENSITIVE_NAMES or name.startswith(".env"):
        return True
    if name.endswith(_SENSITIVE_SUFFIXES):
        return True
    if any(marker in name for marker in ("secret", "password", "credential")):
        return True
    return False


def detect_language(path: str, hint: str | None = None) -> str | None:
    if hint and hint.strip():
        return hint.strip()[:40]
    lower = path.casefold()
    for extension, language in LANGUAGE_BY_EXT.items():
        if lower.endswith(extension):
            return language
    if lower.endswith("dockerfile"):
        return "dockerfile"
    return None


def _tokens(text: str) -> set[str]:
    result: set[str] = set()
    for raw in _WORD.findall(text):
        low = raw.casefold()
        if len(low) < 3 or low in _STOP_WORDS:
            continue
        result.add(low)

        # camelCase / PascalCase / snake_case разбиваем на части.
        parts = re.findall(
            r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])|[А-Яа-яЁё0-9]+",
            raw,
        )
        for part in parts:
            part_low = part.casefold()
            if len(part_low) >= 3 and part_low not in _STOP_WORDS:
                result.add(part_low)

    return result


def clean_files(
    files: Sequence[ProjectFile], warnings: list[str]
) -> list[ProjectFile]:
    """Убирает секреты, дубли, битые пути и слишком большие файлы."""
    result: list[ProjectFile] = []
    seen: set[str] = set()
    total = 0

    for file in files:
        path = _normalize_path(file.path)
        if not path:
            warnings.append(f"Пропущен файл с некорректным путём: {file.path[:120]}")
            continue
        if is_sensitive_path(path):
            warnings.append(f"Пропущен потенциальный секрет: {path}")
            continue
        if path in seen:
            continue
        if "\x00" in file.content:
            warnings.append(f"Пропущен бинарный файл: {path}")
            continue

        seen.add(path)
        content = file.content[:MAX_STORED_FILE]
        if len(file.content) > MAX_STORED_FILE:
            warnings.append(f"Файл {path} обрезан до {MAX_STORED_FILE} символов")

        if total + len(content) > MAX_PROMPT_TOTAL * 4 and result:
            warnings.append("Слишком много файлов: дальше контекст ограничен")
            break

        total += len(content)
        result.append(
            ProjectFile(
                path=path,
                content=content,
                language=detect_language(path, file.language),
            )
        )

    return result


def rank_files(task: str, files: Sequence[ProjectFile]) -> list[ProjectFile]:
    """Ранжирует файлы по совпадению с задачей. Без LLM и без магии."""
    task_tokens = _tokens(task)
    task_lower = task.casefold()
    scored: list[tuple[float, str, ProjectFile]] = []

    for file in files:
        path_lower = file.path.casefold()
        content_lower = file.content.casefold()
        name = path_lower.rsplit("/", 1)[-1]
        score = 0.0

        for token in task_tokens:
            if token in name:
                score += 8
            elif token in path_lower:
                score += 5
            elif token in content_lower:
                score += 1

        if name in ENTRYPOINT_NAMES:
            score += 0.6
        if name.startswith(("app.", "main.", "index.", "server.")):
            score += 0.4
        if len(task_lower) > 2 and name.rsplit(".", 1)[0] in task_lower:
            score += 3

        scored.append((score, path_lower, file))

    scored.sort(key=lambda item: (-item[0], item[1]))
    return [item[2] for item in scored]


def _excerpt(file: ProjectFile, limit: int = MAX_PROMPT_FILE) -> str:
    content = file.content
    if len(content) <= limit:
        return content
    return f"{content[:limit]}\n… (файл обрезан)"


def _build_messages(
    payload: VibeRequest,
    relevant: Sequence[ProjectFile],
) -> list[dict[str, str]]:
    system = """Ты — старший инженер и наставник по вайбкодингу.
Ты не выдумываешь файлы, которых нет в проекте, и не просишь секреты.
Пиши по-русски, коротко и по делу. Верни СТРОГО один JSON-объект без markdown:
{
  "summary": "что происходит и что предлагаешь",
  "relevantFiles": ["только пути из списка"],
  "steps": [
    {"title": "шаг", "detail": "что сделать и зачем", "files": ["путь"]}
  ],
  "changes": [
    {"path": "путь", "language": "язык", "code": "код или фрагмент", "explanation": "объяснение"}
  ],
  "warnings": ["важное предупреждение"]
}
Правила:
- 3–7 последовательных шагов, от понимания к проверке.
- В режиме generate: 1–3 изменения с готовым к адаптации кодом.
- В режиме explain: changes содержат ключевые фрагменты и разбор, без переписывания проекта.
- Используй только переданные пути. Если файлов нет — честно скажи об этом.
- Не обещай запуск, деплой или доступ к сети. Не выводи секреты."""

    file_blocks: list[str] = []
    for file in relevant:
        language = file.language or "text"
        file_blocks.append(
            f'<file path="{file.path}" language="{language}">\n'
            f"{_excerpt(file)}\n"
            "</file>"
        )

    mode_label = "сгенерировать код" if payload.mode == "generate" else "объяснить код"
    user = (
        f"Задача: {payload.task}\n"
        f"Режим: {mode_label}\n"
        f"Источник: {payload.source}\n"
        f"Репозиторий: {payload.repo or '—'}\n\n"
        "Файлы проекта (только они доступны):\n\n"
        + ("\n\n".join(file_blocks) if file_blocks else "— файлы не добавлены —")
    )

    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user[:MAX_PROMPT_TOTAL + 8000]},
    ]


def _meaningful_excerpt(file: ProjectFile, limit: int = 2200) -> str:
    lines = [line.rstrip() for line in file.content.splitlines()]
    while lines and not lines[0].strip():
        lines.pop(0)
    text = "\n".join(lines[:80]).strip()
    return text[:limit]


def _explain_file(file: ProjectFile) -> str:
    content = file.content
    lower = file.path.casefold()

    functions = re.findall(
        r"(?:function|def|func|fn)\s+([A-Za-z_А-Яа-яЁё][\wА-Яа-яЁё]*)",
        content,
    )
    classes = re.findall(r"(?:class|interface|type)\s+([A-Za-z_][\w]*)", content)
    exports = re.findall(r"export\s+(?:default\s+)?(?:function|const|class|interface)\s+([A-Za-z_][\w]*)", content)
    imports = len(re.findall(r"^\s*(?:import|from|require\()", content, re.MULTILINE))
    routes = re.findall(r"(?:@router|@app)\.(?:get|post|put|patch|delete)\(([^)]{0,80})", content)

    role = "модуль проекта"
    if any(key in lower for key in ("api", "client", "fetch", "request")):
        role = "слой работы с API и сетью"
    elif any(key in lower for key in ("component", "components", "page", "pages", "view")):
        role = "интерфейсный компонент"
    elif any(key in lower for key in ("style", ".css", ".scss")):
        role = "оформление и стили"
    elif any(key in lower for key in ("test", "spec")):
        role = "тесты и проверки"
    elif any(key in lower for key in ("config", "settings")):
        role = "конфигурация"
    elif any(key in lower for key in ("store", "state", "hook", "hooks")):
        role = "состояние и логика приложения"
    elif any(key in lower for key in ("server", "main", "app.")):
        role = "точка входа и сборка приложения"

    parts = [f"Файл «{file.path}» — {role}."]
    if functions:
        parts.append(f"Функции: {', '.join(functions[:6])}.")
    if classes:
        parts.append(f"Типы/классы: {', '.join(classes[:6])}.")
    if exports:
        parts.append(f"Экспорты: {', '.join(exports[:6])}.")
    if imports:
        parts.append(f"Импортов: {imports}.")
    if routes:
        clean_routes = [route.strip(" \"'") for route in routes[:5]]
        parts.append(f"Маршруты: {', '.join(clean_routes)}.")

    return " ".join(parts)


def _explain_changes(files: Sequence[ProjectFile]) -> list[VibeChange]:
    code_files = [file for file in files if file.language not in ("markdown", "json")]
    selected = (code_files or list(files))[:2]

    return [
        VibeChange(
            path=file.path,
            language=file.language,
            code=_meaningful_excerpt(file),
            explanation=_explain_file(file),
        )
        for file in selected
    ]


def _code_suggestion(task: str, file: ProjectFile) -> VibeChange:
    language = file.language or "text"
    task_lower = task.casefold()
    path_lower = file.path.casefold()

    if language in ("css", "scss"):
        code = """/* Заготовка под задачу. Подставьте реальные классы проекта. */
.action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 12px;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.action:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}"""
        explanation = "Стили-заготовка: замените `.action` на класс из задачи и проверьте контраст."

    elif language == "python":
        code = '''def solve_task(payload: str) -> str:
    """Заготовка решения. Адаптируйте под реальные типы проекта."""
    value = payload.strip()
    if not value:
        raise ValueError("Пустой ввод")
    return value
'''
        explanation = "Функция-заготовка с валидацией. Подключите её к существующему слою и добавьте тест."

    elif "кнопк" in task_lower or "button" in task_lower:
        code = """type ActionButtonProps = {
  label: string
  onClick: () => void
  disabled?: boolean
}

export function ActionButton({ label, onClick, disabled = false }: ActionButtonProps) {
  return (
    <button
      type="button"
      className="action-button"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}"""
        explanation = "Компонент кнопки с доступным `type=\"button\"`, состоянием disabled и внешним обработчиком."

    elif "форм" in task_lower or "form" in task_lower or "input" in task_lower:
        code = """type FormValues = {
  value: string
}

export function TaskForm({ onSubmit }: { onSubmit: (values: FormValues) => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        onSubmit({ value: String(data.get('value') ?? '').trim() })
      }}
    >
      <label htmlFor="task-value">Значение</label>
      <input id="task-value" name="value" autoComplete="off" required />
      <button type="submit">Сохранить</button>
    </form>
  )
}"""
        explanation = "Форма с подписью, обязательным полем и обработкой submit без перезагрузки страницы."

    elif any(key in task_lower for key in ("api", "запрос", "fetch", "http", "сервер")):
        code = """export async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Запрос не удался: ${response.status}`)
  }

  return (await response.json()) as T
}"""
        explanation = "Обёртка над fetch: проверяет статус, добавляет Accept и возвращает типизированный JSON."

    elif any(key in task_lower for key in ("тест", "test", "spec")):
        code = """describe('task', () => {
  it('обрабатывает основной сценарий', () => {
    expect(true).toBe(true)
  })

  it('не падает на пустом вводе', () => {
    expect(() => null).not.toThrow()
  })
})"""
        explanation = "Скелет тестов: замените заглушки на реальные вызовы и проверки поведения."

    elif language in ("typescript", "tsx", "javascript", "jsx"):
        code = f"""/**
 * Задача: {_SPACES.sub(' ', task)[:160]}
 * Заготовка. Вставьте в «{file.path}» и адаптируйте импорты и типы.
 */
export function solveTask(input: string): string {{
  // TODO: проверьте входные данные и подключите реальную логику.
  return input.trim()
}}"""
        explanation = "Минимальная типизированная заготовка. Дальше подключите её к существующему компоненту или API."

    else:
        code = f"""// Задача: {_SPACES.sub(' ', task)[:180]}
// 1. Проверьте входные данные.
// 2. Вынесите решение в отдельную функцию.
// 3. Добавьте проверку основного сценария.
"""
        explanation = "Пошаговый набросок для файла. Уточните синтаксис под язык проекта."

    if path_lower.endswith((".json", ".md", ".yml", ".yaml", ".toml")):
        explanation += " Это файл конфигурации/документации — меняйте его только при необходимости."

    return VibeChange(
        path=file.path,
        language=language,
        code=code,
        explanation=explanation,
    )


def _offline_response(
    payload: VibeRequest,
    files: Sequence[ProjectFile],
    relevant: Sequence[ProjectFile],
    warnings: list[str],
) -> VibeResponse:
    local_warnings = list(warnings)

    if not files:
        local_warnings.append(
            "Файлы не добавлены: план общий. Добавьте папку проекта или GitHub-репозиторий."
        )
        steps = [
            VibeStep(
                id=_new_id(),
                title="Добавьте проект",
                detail="Откройте локальную папку или импортируйте публичный GitHub-репозиторий.",
                files=[],
            ),
            VibeStep(
                id=_new_id(),
                title="Сформулируйте результат",
                detail="Опишите, что должно измениться: экран, поведение, ошибка или текст.",
                files=[],
            ),
            VibeStep(
                id=_new_id(),
                title="Выберите файлы контекста",
                detail="Отметьте 5–10 файлов рядом с местом изменения — так ответ будет точнее.",
                files=[],
            ),
            VibeStep(
                id=_new_id(),
                title="Проверьте предложение",
                detail="Прочитайте план, примените изменения и запустите основной сценарий вручную.",
                files=[],
            ),
        ]
        return VibeResponse(
            mode=payload.mode,
            summary=(
                f"Задача: «{_SPACES.sub(' ', payload.task)[:300]}». "
                "Проект пока не добавлен, поэтому ниже — честный общий план."
            ),
            relevant_files=[],
            steps=steps,
            changes=[],
            warnings=local_warnings[:MAX_WARNINGS],
            provider=None,
        )

    top_paths = [file.path for file in relevant[:6]]
    if payload.mode == "generate":
        code_files = [file for file in relevant if file.language not in ("markdown", "json", "yaml", "toml")]
        targets = (code_files or list(relevant))[:2]
        changes = [_code_suggestion(payload.task, file) for file in targets]
        summary = (
            f"Задача: «{_SPACES.sub(' ', payload.task)[:300]}». "
            f"В проекте {len(files)} файлов; для контекста выбрано {len(relevant)}. "
            "Предлагаю сначала понять точку изменения, затем внести минимальный патч и проверить сценарий."
        )
        steps = [
            VibeStep(
                id=_new_id(),
                title="Понять текущую структуру",
                detail=f"Начните с {top_paths[0] if top_paths else 'точки входа'}: там видно, как связаны модули.",
                files=top_paths[:3],
            ),
            VibeStep(
                id=_new_id(),
                title="Найти точку изменения",
                detail="Сопоставьте задачу с выбранными файлами и определите минимальный набор правок.",
                files=top_paths[:4],
            ),
            VibeStep(
                id=_new_id(),
                title="Внести минимальный патч",
                detail="Измените один сценарий, не переписывая проект целиком. Сохраните существующие контракты.",
                files=[change.path for change in changes],
            ),
            VibeStep(
                id=_new_id(),
                title="Проверить основной сценарий",
                detail="Запустите проект и пройдите путь пользователя: успех, пустой ввод и ошибка.",
                files=top_paths[:3],
            ),
            VibeStep(
                id=_new_id(),
                title="Закрепить результат",
                detail="Добавьте тест или короткую проверку, чтобы изменение не сломалось позже.",
                files=top_paths[:3],
            ),
        ]
    else:
        changes = _explain_changes(relevant)
        summary = (
            f"Разбираю «{_SPACES.sub(' ', payload.task)[:300]}» по {len(relevant)} выбранным файлам. "
            "Сначала точка входа, затем связи и ключевые функции."
        )
        steps = [
            VibeStep(
                id=_new_id(),
                title="Определить точку входа",
                detail=f"Начните с {top_paths[0] if top_paths else 'главного файла'}: он задаёт сценарий.",
                files=top_paths[:2],
            ),
            VibeStep(
                id=_new_id(),
                title="Пройти по связям",
                detail="Посмотрите импорты и вызовы: так видно, какие модули участвуют в задаче.",
                files=top_paths[2:5],
            ),
            VibeStep(
                id=_new_id(),
                title="Разобрать ключевые функции",
                detail="Читайте сверху вниз: входные данные → ветки → побочные эффекты → результат.",
                files=[change.path for change in changes],
            ),
            VibeStep(
                id=_new_id(),
                title="Собрать объяснение",
                detail="Сформулируйте одной фразой, за что отвечает каждый файл, и проверьте на практике.",
                files=top_paths[:4],
            ),
        ]

    local_warnings.append(
        "Модель недоступна: это детерминированный офлайн-разбор, а не готовый патч. "
        "Проверьте код и пути перед применением."
    )

    return VibeResponse(
        mode=payload.mode,
        summary=summary,
        relevant_files=top_paths,
        steps=steps,
        changes=changes,
        warnings=local_warnings[:MAX_WARNINGS],
        provider=None,
    )


def _as_str(value: object, limit: int = 4000) -> str:
    return str(value).strip()[:limit] if value is not None else ""


def _as_list(value: object) -> list[object]:
    return value if isinstance(value, list) else []


def _parse_model_response(
    text: str,
    payload: VibeRequest,
    allowed_paths: set[str],
) -> VibeResponse | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```[a-zA-Z]*\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end <= start:
        return None

    try:
        data = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None

    summary = _as_str(data.get("summary") or data.get("explanation"))
    if not summary:
        return None

    relevant_raw = _as_list(data.get("relevantFiles") or data.get("relevant_files"))
    relevant = [
        str(path)
        for path in relevant_raw
        if isinstance(path, str) and path in allowed_paths
    ][:20]

    steps: list[VibeStep] = []
    for item in _as_list(data.get("steps")):
        if not isinstance(item, dict):
            continue

        title = _as_str(item.get("title") or item.get("name"), 200)
        if not title:
            continue

        files = [
            str(path)
            for path in _as_list(item.get("files"))
            if isinstance(path, str) and path in allowed_paths
        ][:12]
        steps.append(
            VibeStep(
                id=_new_id(),
                title=title,
                detail=_as_str(item.get("detail") or item.get("description"), 2000),
                files=files,
            )
        )
        if len(steps) >= 8:
            break

    changes: list[VibeChange] = []
    for item in _as_list(data.get("changes")):
        if not isinstance(item, dict):
            continue

        path = _as_str(item.get("path"), 400)
        if path not in allowed_paths:
            continue

        changes.append(
            VibeChange(
                path=path,
                language=_as_str(item.get("language"), 40) or detect_language(path),
                code=_as_str(item.get("code"), 40_000),
                explanation=_as_str(
                    item.get("explanation") or item.get("description"),
                    4000,
                ),
            )
        )
        if len(changes) >= MAX_CHANGES:
            break

    warnings = [
        _as_str(item, 500)
        for item in _as_list(data.get("warnings"))
        if _as_str(item, 500)
    ][:MAX_WARNINGS]

    if not steps:
        return None

    return VibeResponse(
        mode=payload.mode,
        summary=summary,
        relevant_files=relevant,
        steps=steps,
        changes=changes,
        warnings=warnings,
    )


async def analyze(payload: VibeRequest, settings: Settings) -> VibeResponse:
    """Анализирует задачу через LLM, но всегда возвращает полезный план."""
    warnings: list[str] = []
    files = clean_files(payload.files, warnings)
    relevant = rank_files(payload.task, files)[:MAX_CONTEXT_FILES]
    fallback = _offline_response(payload, files, relevant, warnings)

    if not files:
        return fallback

    messages = _build_messages(payload, relevant)

    try:
        text, provider = await asyncio.wait_for(
            complete_text(messages, settings=settings, temperature=0.2),  # type: ignore[arg-type]
            timeout=60,
        )
    except Exception:  # noqa: BLE001 - офлайн-план важнее ошибки провайдера
        text, provider = "", None

    if text:
        allowed_paths = {file.path for file in files}
        parsed = _parse_model_response(text, payload, allowed_paths)
        if parsed is not None:
            parsed.provider = provider
            parsed.warnings = [*warnings, *parsed.warnings][:MAX_WARNINGS]
            if not parsed.relevant_files:
                parsed.relevant_files = [file.path for file in relevant[:8]]
            if payload.mode == "explain" and not parsed.changes:
                parsed.changes = fallback.changes
            return parsed

    if text:
        fallback.warnings.append("Ответ модели не удалось разобрать — показан офлайн-план.")
        fallback.warnings = fallback.warnings[:MAX_WARNINGS]

    return fallback
