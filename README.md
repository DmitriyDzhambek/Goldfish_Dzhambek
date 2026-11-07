# 🐠 Золотая рыбка

> ИИ-ассистент, который превращает желание в план из шагов и доводит дело до конца.
> Не «ещё один ChatGPT», а спокойный помощник с характером Золотой Рыбки.

**Невод → желание → исполнение.**

Проект **полностью бесплатный и безлимитный**: ни тарифов, ни paywall, ни рекламы,
ни счётчика «осталось 2 желания». Регистрация необязательна — гость получает всё то же самое.

---

## Статус: этап 1 — фундамент и сцена

Сейчас в репозитории готов первый слой:

- ✅ Vite + React 18 + TypeScript (strict), CSS Modules, framer-motion
- ✅ Дизайн-система «ночное море»: токены цвета, стекло, золото, бирюза
- ✅ Живая сцена: градиент, звёзды, волны в три слоя, каустики, луч, зерно
- ✅ SVG-рыбка: дыхание, хвост, плавники, блик по чешуе, моргание, взгляд за курсором,
      состояния `idle / listening / thinking / speaking`
- ✅ Пузырьки на Canvas 2D + переключатель персонажей Рыбка / Колобок
- ✅ Адаптивная оболочка: шапка, нижняя навигация, стеклянные карточки
- ✅ PWA-манифест и service worker (только в production-сборке)
- ✅ FastAPI-скелет: роутеры, схемы, единый конверт ошибок, JSON-store, тесты
- ⏳ Чат, голос, желания, память, аккаунт — следующие этапы (см. дорожную карту)

Все API-эндпоинты пока отвечают `501 not_implemented` в общем формате ошибок —
это зафиксированный контракт, а не случайная заглушка.

---

## Быстрый старт

### 1. Фронтенд

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
npm run dev               # http://localhost:5173
```

`/api` в dev-режиме проксируется на `http://127.0.0.1:8000` (см. `vite.config.ts`).

### 2. Бэкенд

```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

pip install -r backend/requirements-dev.txt
uvicorn backend.main:app --reload --port 8000
```

- Swagger: <http://127.0.0.1:8000/api/docs>
- Health: <http://127.0.0.1:8000/api/health>

### 3. Проверки

```bash
npm run check          # TypeScript, оба tsconfig
npm run build          # check + production-сборка
npm run test:backend   # pytest (нужен активированный .venv)
```

### 4. Работа без ключей LLM

На этапе 1 сетевых вызовов LLM нет вообще. Начиная с этапа 2 при пустых
`LLM_*` сервис будет переходить к локальной Ollama, а затем — к офлайн-ответам.
Ключи не нужны, чтобы запустить и посмотреть сцену.

---

## Переменные окружения

Скопируй `.env.example` в `.env`. В репозитории секретов нет.

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `VITE_API_BASE_URL` | База API для фронтенда | `/api` |
| `VITE_PROXY_TARGET` | Куда Vite проксирует `/api` в dev | `http://127.0.0.1:8000` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | Основной OpenAI-совместимый провайдер | пусто |
| `LLM_FALLBACK_*` | Бесплатный резерв (OpenRouter free / Gemini) | пусто |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | Локальная модель | `http://127.0.0.1:11434/v1`, `qwen2.5:7b-instruct` |
| `DATABASE_URL` | PostgreSQL (Neon/Supabase) | пусто → JSON |
| `DATA_DIR` | Папка JSON-хранилища | `backend/data` |
| `CORS_ORIGINS` | Разрешённые источники через запятую | `localhost:5173` |
| `RATE_LIMIT_PER_MINUTE` | Мягкий лимит запросов (этап 7) | `30` |
| `MAGIC_LINK_SECRET` | Подпись magic-link токенов | пусто |
| `PUBLIC_BASE_URL` | Публичный адрес для ссылок в письмах | `http://localhost:5173` |

> ⚠️ Всё, что начинается с `VITE_`, попадает в клиентский бандл.
> Ключи LLM — только без префикса и только на сервере.

---

## Контракты API

Формат ошибок всегда один:

```json
{ "error": { "code": "not_implemented", "message": "Чат появится на этапе 2" } }
```

| Метод | Путь | Назначение | Статус |
|---|---|---|---|
| `POST` | `/api/chat` | SSE-поток: `data: {"delta":"..."}` → `data: {"done":true,"usage":{}}` | этап 2 |
| `GET` | `/api/wishes` | `{ "wishes": [...] }` | этап 2 |
| `POST` | `/api/wishes` | Создать желание `{ "title", "note?" }` | этап 2 |
| `PATCH` | `/api/wishes/{id}` | Обновить желание или шаги | этап 2 |
| `GET` | `/api/memory` | `{ "facts": [...], "updatedAt": null }` | этап 4 |
| `PUT` | `/api/memory` | Заменить снимок фактов | этап 4 |
| `POST` | `/api/auth/request` | Отправить magic link | этап 5 |
| `GET` | `/api/auth/callback?token=...` | Подтвердить вход | этап 5 |
| `GET` | `/api/health` | Живость сервиса | ✅ |

Клиент API с типизированным SSE-парсером уже лежит в `src/api/client.ts`:
`streamChat()` умеет читать поток, обрабатывать `[DONE]` и отменяться через `AbortSignal`.

---

## Дизайн-система

Токены — в `src/styles/tokens.css`, ничего не хардкодим в компонентах.

| Группа | Примеры |
|---|---|
| Море | `--scene-top`, `--scene-deep`, `--scene-mid`, `--scene-soft` |
| Золото | `--gold-100 … --gold-700`, `--stroke-gold`, `--glow-gold` |
| Бирюза | `--aqua-200`, `--aqua-400`, `--aqua-600` |
| Текст | `--text`, `--text-dim`, `--text-mute` |
| Стекло | `--glass`, `--stroke`, `--shadow-card` |
| Геометрия | `--radius-sm … --radius-pill`, `--header-h`, `--safe-bottom` |

Переключение персонажа ставит `data-character="fish|kolobok"` на `<html>`:
меняются палитра сцены и аватар, интерфейс остаётся тем же.

### Анимация и производительность

- Только `transform` и `opacity` в циклах; `will-change` — точечно.
- Canvas частиц: один `requestAnimationFrame`, DPR ≤ 2, пауза при скрытой вкладке.
- Слабые устройства (`hardwareConcurrency ≤ 4`, `deviceMemory ≤ 4`, Save-Data)
  получают `data-quality="lite"`: без каустиков и Canvas-частиц, дешёвое стекло.
- `prefers-reduced-motion: reduce`: статичная сцена и мгновенные переходы.
- Анимации ставятся на паузу при `document.visibilityState === 'hidden'`.
- Никаких видеофонов и GIF.

---

## Структура

```text
zolotaya-rybka/
  src/
    App.tsx                 # оболочка, вкладки, переключатель персонажей
    characters.ts           # тексты и метаданные персонажей
    api/client.ts           # fetch-обёртка, SSE-парсер, типы контрактов
    components/
      layout/               # шапка-переключатель, нижняя навигация
      scene/                # сцена, волны, рыбка, пузырьки, Колобок
      ui/                   # GlassCard
    hooks/useSceneQuality.ts
    lib/                    # storage, css-vars
    memory/                 # гостевая память в localStorage
    speech/                 # поддержка Web Speech API, характер голоса
    wishes/                 # прогресс и статусы желаний
    pages/                  # HomeHero, StagePage
    styles/                 # tokens.css, global.css
  backend/
    main.py                 # FastAPI, CORS, обработчики ошибок
    config.py               # env → Settings
    schemas.py              # Pydantic-контракты (camelCase ↔ snake_case)
    errors.py               # единый конверт ошибок
    llm.py                  # системный промт и сборка сообщений
    wishes.py / memory.py   # доменная логика
    db.py                   # атомарный JSON-store
    routers/                # chat, wishes, memory, auth
    tests/                  # pytest
  public/                   # manifest, sw.js, иконки
  .env.example
  README.md
```

---

## Дорожная карта

| Этап | Содержание | Статус |
|---|---|---|
| 1 | Скелет, дизайн-система, статичная сцена с рыбкой, API-скелет | ✅ |
| 2 | Чат: SSE-стриминг, история, `useGoldfishAgent`, голос ru-RU, push-to-talk | следующее |
| 3 | Желания: план 3–7 шагов, прогресс, анимация исполнения | — |
| 4 | Память: факты, сжатие истории, использование в промте | — |
| 5 | Аккаунт: гостевой режим → magic link, перенос данных | — |
| 6 | PWA-полировка, офлайн-ответы, доступность, 60 fps на среднем телефоне | — |
| 7 | Деплой, rate limit, валидация, аудит безопасности | — |

### Цепочка моделей (этап 2)

```text
основной провайдер → бесплатный fallback → Ollama (qwen2.5 / llama3.1) → офлайн-ответы
```

Если внешняя квота исчерпана, сервис не показывает ошибку, а тихо переключается
и пишет одной строкой: «Рыбка нырнула глубже — отвечает локальная модель».

---

## Деплой

- **Фронтенд:** Vercel / Netlify, build command `npm run build`, output `dist`.
  Для SPA нужен rewrite всех путей на `/index.html`; `/api/*` — на бэкенд.
- **Бэкенд:** Render / Fly.io, start command
  `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
- **БД:** Neon / Supabase → `DATABASE_URL`. Без него работает JSON-файл (для одного инстанса).
- **Секреты:** только в панели хостинга, не в репозитории.
- Service worker включается в production-сборке; установка PWA требует HTTPS
  (или `localhost`).

---

## Принципы

- Нет подписок, платежей, рекламы и «премиум-желаний».
- Нет лимитов на желания, сообщения, шаги и сессии.
- Гость = полноценный пользователь.
- Данные можно выгрузить и удалить (этап 5).
- Исходный код открыт под MIT.

## Лицензия

[MIT](LICENSE)
