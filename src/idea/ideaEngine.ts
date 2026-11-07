/**
 * Движок «Рыбка-архитектор».
 *
 * Пользователь приносит сырую идею — движок собирает ответ в духе Стива Джобса:
 *   1. Видение (The Vision) — концепция простым языком, «как это должно ощущаться».
 *   2. Стек (The Stack)     — технологии и почему именно они.
 *   3. Код (The Code)       — готовый артефакт: React-компонент первого экрана.
 *
 * Ответ отдаётся как сценарий (IdeaScript) из сегментов. Компонент проигрывает
 * сценарий через streamText / streamCode — это имитация стриминга: текст
 * появляется по чуть-чуть, будто Рыбка печатает в реальном времени.
 *
 * Позже `buildIdeaScript` можно заменить на реальный SSE-поток с бэкенда —
 * контракт сегментов останется тем же.
 */

/* ── Публичные типы ─────────────────────────────────────────── */

export interface IdeaArtifact {
  id: string
  /** Имя файла, как он будет лежать в проекте пользователя. */
  fileName: string
  language: string
  title: string
  code: string
  /** Самодостаточный HTML для живого превью в iframe (или null). */
  previewHtml: string | null
}

export type IdeaSuggestionKind = 'design' | 'logic' | 'test' | 'explain' | 'free'

export interface IdeaSuggestion {
  label: string
  kind: IdeaSuggestionKind
}

export type IdeaStage = 'vision' | 'stack' | 'code'

export type IdeaMessageKind = 'idea' | 'followup' | 'explanation'

export interface IdeaMessage {
  id: string
  role: 'user' | 'assistant'
  kind: IdeaMessageKind
  stage: IdeaStage | null
  text: string
  artifact: IdeaArtifact | null
}

export type IdeaSegment =
  | { type: 'text'; stage: IdeaStage | null; text: string }
  | { type: 'artifact'; artifact: IdeaArtifact }

export interface IdeaScript {
  segments: IdeaSegment[]
  suggestions: IdeaSuggestion[] | null
}

export interface IdeaContext {
  /** Сырая первая идея пользователя — якорь всего диалога. */
  idea: string
  topic: string
  turns: number
  lastArtifact: IdeaArtifact | null
}

/** Токен отмены: компонент гасит прошлый сценарий при новом сообщении. */
export interface StreamSignal {
  cancelled: boolean
}

/* ── Утилиты ────────────────────────────────────────────────── */

const STOP_PREFIXES =
  /^(создать|создай|сделать|сделай|написать|напиши|разработать|разработай|спроектируй|придумай|хочу|нужно|надо|давай|давайте)\s+/i

/** Вытаскивает из сырой идеи короткую «тему» для повторного использования. */
export function topicFromIdea(idea: string): string {
  let topic = idea.trim().replace(/\s+/g, ' ')
  for (let guard = 0; guard < 4; guard += 1) {
    const next = topic.replace(STOP_PREFIXES, '')
    if (next === topic) break
    topic = next
  }
  topic = topic.replace(/[.!?]+$/, '')
  return topic.length > 0 ? topic : idea.trim()
}

function pascalCase(topic: string): string {
  const words = topic
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
  if (words.length === 0) return 'IdeaScreen'
  const joined = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return /^[A-Za-z]/.test(joined) ? `${joined}Screen` : 'IdeaScreen'
}

function kebabCase(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, '')
    .trim()
    .replace(/\s+/g, '-')
  return slug || 'idea'
}

let seq = 0
export function uid(prefix: string): string {
  seq += 1
  return `${prefix}-${Date.now().toString(36)}-${seq}`
}

export function sleep(ms: number, signal?: StreamSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.cancelled) {
      resolve()
      return
    }
    const timer = window.setTimeout(() => resolve(), ms)
    if (signal) {
      const check = window.setInterval(() => {
        if (signal.cancelled) {
          window.clearInterval(check)
          window.clearTimeout(timer)
          resolve()
        }
      }, 40)
      // Подстраховка: интервал не должен жить вечно.
      window.setTimeout(() => window.clearInterval(check), ms + 60)
    }
  })
}

/* ── Стриминг: имитация живой печати ────────────────────────── */

const WORD_CHUNK_MIN = 2
const WORD_CHUNK_MAX = 7
const CHAR_CHUNK_MIN = 3
const CHAR_CHUNK_MAX = 12

function randomInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** Печатает обычный текст «слово за словом», с живым, неровным ритмом. */
export async function streamText(
  text: string,
  onChunk: (chunk: string) => void,
  signal?: StreamSignal,
  msPerChunk = 26,
): Promise<void> {
  const tokens = text.split(/(\s+)/).filter((token) => token.length > 0)
  let buffer = ''
  let budget = randomInt(WORD_CHUNK_MIN, WORD_CHUNK_MAX)

  for (const token of tokens) {
    if (signal?.cancelled) return
    buffer += token
    if (!/^\s+$/.test(token)) budget -= 1
    if (budget <= 0) {
      onChunk(buffer)
      buffer = ''
      budget = randomInt(WORD_CHUNK_MIN, WORD_CHUNK_MAX)
      await sleep(msPerChunk * randomInt(1, 2), signal)
    }
  }
  if (buffer.length > 0) onChunk(buffer)
}

/** Печатает код: быстрее текста, ровным потоком символов. */
export async function streamCode(
  code: string,
  onChunk: (chunk: string) => void,
  signal?: StreamSignal,
  msPerChunk = 9,
): Promise<void> {
  let index = 0
  while (index < code.length) {
    if (signal?.cancelled) return
    const size = randomInt(CHAR_CHUNK_MIN, CHAR_CHUNK_MAX)
    onChunk(code.slice(index, index + size))
    index += size
    await sleep(msPerChunk, signal)
  }
}

/* ── Шаблоны контента ───────────────────────────────────────── */

function isAbout(idea: string, words: string[]): boolean {
  const lower = idea.toLowerCase()
  return words.some((word) => lower.includes(word))
}

/* — Демо-артефакт: ВПН + шагомер — */

const VPN_STEP_CODE = `// src/screens/VpnStepScreen.tsx — первый экран: одна кнопка, один круг.
import { useEffect, useState } from 'react'
import { connectVpn, disconnectVpn, onStepCount } from '../lib/vpn'

export function VpnStepScreen() {
  const [connected, setConnected] = useState(false)
  const [steps, setSteps] = useState(0)
  const [busy, setBusy] = useState(false)

  // Шаги приходят из HealthKit / Google Fit — сами мы их не считаем.
  useEffect(() => onStepCount(setSteps), [])

  async function toggle() {
    setBusy(true)
    try {
      if (connected) {
        await disconnectVpn()
      } else {
        await connectVpn()
      }
      setConnected(!connected)
    } finally {
      setBusy(false)
    }
  }

  const progress = Math.min(steps / 10_000, 1)

  return (
    <main className="screen">
      <h1>Приватность в движении</h1>

      <div
        className="ring"
        role="progressbar"
        aria-valuenow={steps}
        aria-valuemax={10_000}
        style={{ '--progress': progress } as React.CSSProperties}
      >
        <span className="ring-value">{steps.toLocaleString('ru-RU')}</span>
        <small className="ring-label">шагов сегодня</small>
      </div>

      <button className="connect" onClick={toggle} disabled={busy}>
        {connected ? 'Отключиться' : 'Подключиться'}
      </button>
    </main>
  )
}`

function vpnStepPreviewHtml(): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(120% 90% at 50% 0%, #141d33 0%, #0a0e17 70%);
    font-family: 'Segoe UI', system-ui, sans-serif; color: #fff;
  }
  .screen { text-align: center; padding: 32px; }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: 0.02em; opacity: 0.92; }
  .ring {
    --progress: 0.42;
    width: 190px; height: 190px; margin: 28px auto; border-radius: 50%;
    display: grid; place-items: center; position: relative;
    background:
      radial-gradient(closest-side, #0e1526 88%, transparent 89% 100%),
      conic-gradient(#ffd700 calc(var(--progress) * 100%), rgba(255,255,255,0.08) 0);
    box-shadow: 0 0 44px rgba(249, 207, 107, 0.16);
    animation: pulse 3.2s ease-in-out infinite;
  }
  @keyframes pulse { 50% { box-shadow: 0 0 64px rgba(249, 207, 107, 0.3); } }
  .ring-value { font-size: 34px; font-weight: 700; color: #ffe55c; }
  .ring-label { display: block; margin-top: 4px; font-size: 12px; opacity: 0.55; }
  .connect {
    margin-top: 8px; padding: 14px 44px; border: 0; border-radius: 999px;
    font-size: 15px; font-weight: 600; color: #0a0e17; cursor: pointer;
    background: linear-gradient(180deg, #ffe55c, #ffd700);
    box-shadow: 0 10px 30px -10px rgba(255, 215, 0, 0.55);
  }
</style></head>
<body><div class="screen">
  <h1>Приватность в движении</h1>
  <div class="ring"><div><span class="ring-value">4 213</span><small class="ring-label">шагов сегодня</small></div></div>
  <button class="connect">Подключиться</button>
</div></body></html>`
}

/* — Генерик-артефакт для любой другой идеи — */

function genericScreenCode(topic: string, name: string): string {
  return `// src/screens/${name}.tsx — первый экран идеи «${topic}».
// Принцип Джобса: главное — сразу. Всё остальное — потом.
import { useState } from 'react'

export function ${name}() {
  const [active, setActive] = useState(false)

  return (
    <main className="screen">
      <header>
        <h1>${topic}</h1>
        <p>Одна кнопка. Ноль настроек. Ощущение — как у хорошей ручки.</p>
      </header>

      <button className="primary" onClick={() => setActive((value) => !value)}>
        {active ? 'Пауза' : 'Начать'}
      </button>

      {active && (
        <section className="card" aria-live="polite">
          Здесь появится основная логика «${topic}».
        </section>
      )}
    </main>
  )
}`
}

function genericPreviewHtml(topic: string): string {
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    min-height: 100vh; display: grid; place-items: center;
    background: radial-gradient(120% 90% at 50% 0%, #141d33 0%, #0a0e17 70%);
    font-family: 'Segoe UI', system-ui, sans-serif; color: #fff;
  }
  .screen { text-align: center; max-width: 360px; padding: 32px; }
  h1 { font-size: 22px; font-weight: 600; letter-spacing: 0.01em; }
  p { margin-top: 10px; font-size: 13px; line-height: 1.55; opacity: 0.6; }
  .primary {
    margin-top: 26px; padding: 14px 44px; border: 0; border-radius: 999px;
    font-size: 15px; font-weight: 600; color: #0a0e17; cursor: pointer;
    background: linear-gradient(180deg, #ffe55c, #ffd700);
    box-shadow: 0 10px 30px -10px rgba(255, 215, 0, 0.55);
  }
  .card {
    margin-top: 22px; padding: 18px 20px; border-radius: 18px; font-size: 13px;
    background: rgba(255, 255, 255, 0.055); border: 1px solid rgba(255, 255, 255, 0.12);
  }
</style></head>
<body><div class="screen">
  <h1>${topic}</h1>
  <p>Одна кнопка. Ноль настроек. Ощущение — как у хорошей ручки.</p>
  <button class="primary">Начать</button>
  <div class="card">Здесь появится основная логика «${topic}».</div>
</div></body></html>`
}

/* ── Сценарий первой идеи ───────────────────────────────────── */

const BASE_SUGGESTIONS: IdeaSuggestion[] = [
  { label: 'Улучшить дизайн', kind: 'design' },
  { label: 'Добавить логику', kind: 'logic' },
  { label: 'Протестировать', kind: 'test' },
]

export function buildIdeaScript(idea: string): IdeaScript {
  const topic = topicFromIdea(idea)
  const vpn = isAbout(idea, ['впн', 'vpn', 'приватн', 'прокси'])
  const steps = isAbout(idea, ['шаг', 'шагомер', 'фитнес', 'здоров', 'активност', 'бег', 'ходьб'])

  if (vpn && steps) {
    return {
      segments: [
        {
          type: 'text',
          stage: 'vision',
          text:
            'Видение. Это приложение для тех, кто заботится о приватности и здоровье. ' +
            'Оно должно ощущаться как один жест: открыл — нажал «Подключиться» — и всё. ' +
            'Никаких вкладок, никаких настроек. Один большой круг с твоими шагами, ' +
            'который мягко пульсирует, пока твои данные под защитой. ' +
            'Красота — в том, чего нет: нет кнопок ради кнопок, нет экранов ради процессов.',
        },
        {
          type: 'text',
          stage: 'stack',
          text:
            'Технологии. React Native и TypeScript — один код для iOS и Android с нативной скоростью. ' +
            'HealthKit и Google Fit — честные шаги, без собственного трекера. ' +
            'WireGuard (WireGuardKit, wireguard-android) — современный VPN: быстрый, тихий, надёжный. ' +
            'Mapbox пригодится, только если захочешь видеть маршрут прогулки на карте. ' +
            'Код ниже — первый экран. Он уже живой: кнопка, круг, счётчик.',
        },
        {
          type: 'artifact',
          artifact: {
            id: uid('artifact'),
            fileName: 'src/screens/VpnStepScreen.tsx',
            language: 'tsx',
            title: 'VpnStepScreen',
            code: VPN_STEP_CODE,
            previewHtml: vpnStepPreviewHtml(),
          },
        },
      ],
      suggestions: BASE_SUGGESTIONS,
    }
  }

  if (vpn) {
    return {
      segments: [
        {
          type: 'text',
          stage: 'vision',
          text: `Видение. «${topic}» — это не «настройки и серверы», это тишина в эфире. ` +
            'Один переключатель: включил — и traf­фик уходит в туннель. ' +
            'Интерфейс показывает ровно три вещи: ты защищён, скорость в порядке, всё хорошо.',
        },
        {
          type: 'text',
          stage: 'stack',
          text:
            'Технологии. React Native + TypeScript для интерфейса, WireGuard для туннеля, ' +
            ' избранные серверы — через простой конфиг в JSON. Никаких дашбордов: один экран.',
        },
        {
          type: 'artifact',
          artifact: {
            id: uid('artifact'),
            fileName: 'src/screens/VpnScreen.tsx',
            language: 'tsx',
            title: 'VpnScreen',
            code: genericScreenCode(topic, 'VpnScreen'),
            previewHtml: genericPreviewHtml(topic),
          },
        },
      ],
      suggestions: BASE_SUGGESTIONS,
    }
  }

  if (steps) {
    return {
      segments: [
        {
          type: 'text',
          stage: 'vision',
          text: `Видение. «${topic}» — это зеркало твоего дня. ` +
            'Открываешь приложение — и видишь одно: сколько ты уже прошёл и сколько осталось до цели. ' +
            'Круг заполняется золотом. Никаких графиков на семь вкладок.',
        },
        {
          type: 'text',
          stage: 'stack',
          text:
            'Технологии. React Native + TypeScript, HealthKit и Google Fit для честных шагов, ' +
            'реактивный стор (zustand) — чтобы круг обновлялся сам, без перезагрузок.',
        },
        {
          type: 'artifact',
          artifact: {
            id: uid('artifact'),
            fileName: 'src/screens/StepsScreen.tsx',
            language: 'tsx',
            title: 'StepsScreen',
            code: genericScreenCode(topic, 'StepsScreen'),
            previewHtml: genericPreviewHtml(topic),
          },
        },
      ],
      suggestions: BASE_SUGGESTIONS,
    }
  }

  const name = pascalCase(topic)
  return {
    segments: [
      {
        type: 'text',
        stage: 'vision',
        text: `Видение. «${topic}» должно ощущаться как предмет, который просто лежит в руке и делает свою работу. ` +
          'Первый экран отвечает на один вопрос — зачем пользователь здесь пришёл, — и делает это мгновенно. ' +
          'Мы уберём всё, что не помогает главному действию: если элемент можно удалить без потери смысла — его не будет.',
      },
      {
        type: 'text',
        stage: 'stack',
        text:
          'Технологии. React + TypeScript + Vite — быстрый старт и строгие типы. ' +
          'Tailwind для спокойной, чистой вёрстки. ' +
          'Состояние — на хуках, пока проект не дорос до сложного стора. ' +
          'Ниже — каркас первого экрана: он компилируется и уже работает.',
      },
      {
        type: 'artifact',
        artifact: {
          id: uid('artifact'),
          fileName: `src/screens/${name}.tsx`,
          language: 'tsx',
          title: name,
          code: genericScreenCode(topic, name),
          previewHtml: genericPreviewHtml(topic),
        },
      },
    ],
    suggestions: BASE_SUGGESTIONS,
  }
}

/* ── Сценарии продолжения диалога ───────────────────────────── */

function designScript(ctx: IdeaContext): IdeaScript {
  return {
    segments: [
      {
        type: 'text',
        stage: null,
        text: `Дизайн. Премиальность — это не украшения, а дисциплина. ` +
          'Глубокий синий фон, один золотой акцент на главном действии, ' +
          'и много воздуха. Взгляду не за что зацепиться лишний раз — ' +
          'и потому всё кажется дороже. Вот стили для первого экрана:',
      },
      {
        type: 'artifact',
        artifact: {
          id: uid('artifact'),
          fileName: `src/screens/${kebabCase(ctx.topic)}-screen.css`,
          language: 'css',
          title: 'Стили первого экрана',
          code: `/* ${ctx.topic}: премиальная простота.
   Палитра: глубокий космос + одно золото. Больше ничего. */

.screen {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  gap: 28px;
  text-align: center;
  padding: 32px;
  background:
    radial-gradient(120% 90% at 50% 0%, #141d33 0%, #0a0e17 70%);
  color: #fff;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
}

.screen h1 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.primary,
.connect {
  justify-self: center;
  padding: 14px 44px;
  border: 0;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 600;
  color: #0a0e17;
  cursor: pointer;
  background: linear-gradient(180deg, #ffe55c, #ffd700);
  box-shadow: 0 10px 30px -10px rgba(255, 215, 0, 0.55);
  transition: transform 160ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.primary:active { transform: scale(0.97); }

.card {
  padding: 18px 20px;
  border-radius: 18px;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.055);
  border: 1px solid rgba(255, 255, 255, 0.12);
}`,
          previewHtml: null,
        },
      },
    ],
    suggestions: [
      { label: 'Добавить анимации', kind: 'design' },
      { label: 'Добавить логику', kind: 'logic' },
      { label: 'Протестировать', kind: 'test' },
    ],
  }
}

function logicScript(ctx: IdeaContext): IdeaScript {
  const vpn = isAbout(ctx.idea, ['впн', 'vpn'])
  const steps = isAbout(ctx.idea, ['шаг', 'шагомер', 'фитнес', 'здоров'])
  const name = vpn ? 'VpnController' : `use${pascalCase(ctx.topic).replace(/Screen$/, '')}`

  const code = vpn
    ? `// src/lib/vpn.ts — тонкая обёртка над WireGuard.
// Интерфейс — из трёх функций. Всё остальное — детали реализации.
import { NativeModules } from 'react-native'

const { WireGuardBridge } = NativeModules

export interface VpnStatus {
  connected: boolean
  serverRegion: string
  since: number | null
}

export async function connectVpn(): Promise<VpnStatus> {
  return WireGuardBridge.connect()
}

export async function disconnectVpn(): Promise<VpnStatus> {
  return WireGuardBridge.disconnect()
}

export function onStepCount(callback: (steps: number) => void): () => void {
  const subscription = deviceEventEmitter.addListener('stepCount', callback)
  return () => subscription.remove()
}`
    : `// src/hooks/${name}.ts — вся логика «${ctx.topic}» в одном хуке.
import { useCallback, useEffect, useState } from 'react'

export interface ${name}State {
  active: boolean
  busy: boolean
  error: string | null
}

export function ${name}() {
  const [state, setState] = useState<${name}State>({
    active: false,
    busy: false,
    error: null,
  })

  const toggle = useCallback(async () => {
    setState((prev) => ({ ...prev, busy: true, error: null }))
    try {
      // Здесь появится реальная логика «${ctx.topic}».
      await new Promise((resolve) => setTimeout(resolve, 600))
      setState((prev) => ({ ...prev, active: !prev.active }))
    } catch {
      setState((prev) => ({ ...prev, error: 'Не получилось. Попробуй ещё раз.' }))
    } finally {
      setState((prev) => ({ ...prev, busy: false }))
    }
  }, [])

  useEffect(() => {
    // Подписки и очистка — здесь.
  }, [])

  return { ...state, toggle }
}`;

  return {
    segments: [
      {
        type: 'text',
        stage: null,
        text: steps
          ? 'Логика. Шаги считает система — HealthKit или Google Fit. ' +
            'Мы только подписываемся на поток и рисуем круг. ' +
            'VPN-состояние живёт отдельно, чтобы шаги не пропадали при переключении туннеля.'
          : 'Логика. Прячем всё сложное за одним хуком: компонент знает только про «начать» и «пауза». ' +
            'Так интерфейс остаётся простым, даже когда внутри всё усложняется.',
      },
      {
        type: 'artifact',
        artifact: {
          id: uid('artifact'),
          fileName: vpn ? 'src/lib/vpn.ts' : `src/hooks/${name}.ts`,
          language: 'ts',
          title: vpn ? 'Обёртка WireGuard' : `Хук ${name}`,
          code,
          previewHtml: null,
        },
      },
    ],
    suggestions: [
      { label: 'Улучшить дизайн', kind: 'design' },
      { label: 'Протестировать', kind: 'test' },
    ],
  }
}

function testScript(ctx: IdeaContext): IdeaScript {
  const name = ctx.lastArtifact?.title ?? pascalCase(ctx.topic)
  return {
    segments: [
      {
        type: 'text',
        stage: null,
        text: 'Тесты. Проверяем не код, а ощущение: главный сценарий — «открыл и за секунду понял». ' +
          'В автоматике это три вещи: экран рендерится, главное действие работает, ' +
          'ошибки не пугают пользователя. Вот базовый набор:',
      },
      {
        type: 'artifact',
        artifact: {
          id: uid('artifact'),
          fileName: `src/screens/${name}.test.tsx`,
          language: 'tsx',
          title: 'Тесты первого экрана',
          code: `// src/screens/${name}.test.tsx — Vitest + Testing Library.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ${name} } from './${name}'

describe('${name}', () => {
  it('показывает главное действие сразу', () => {
    render(<${name} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('реагирует на главное действие', () => {
    render(<${name} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent(/пауза/i)
  })

  it('держит интерфейс спокойным: лишнего на экране нет', () => {
    const { container } = render(<${name} />)
    expect(container.querySelectorAll('button')).toHaveLength(1)
  })
})`,
          previewHtml: null,
        },
      },
    ],
    suggestions: [
      { label: 'Улучшить дизайн', kind: 'design' },
      { label: 'Добавить логику', kind: 'logic' },
    ],
  }
}

function freeScript(ctx: IdeaContext): IdeaScript {
  return {
    segments: [
      {
        type: 'text',
        stage: null,
        text: `Хорошо. Помню всё, что мы обсудили: идея — «${ctx.topic}», первый экран уже готов. ` +
          'Скажи, что меняем: ощущение, поведение или надёжность — ' +
          'и я переделаю только нужную часть, не трогая остальное.',
      },
    ],
    suggestions: BASE_SUGGESTIONS,
  }
}

export function buildFollowupScript(input: string, ctx: IdeaContext): IdeaScript {
  const lower = input.toLowerCase()

  if (/(дизайн|стил|красив|анимац|оформ|внешн)/.test(lower)) return designScript(ctx)
  if (/(логик|шагомер|шаг|подключ|vpn|впн|данн|api|функци|состояни|хук)/.test(lower)) {
    return logicScript(ctx)
  }
  if (/(тест|провер|протестир|качеств)/.test(lower)) return testScript(ctx)

  return freeScript(ctx)
}

/* ── Сценарий «Объяснить» ───────────────────────────────────── */

export function buildExplainScript(artifact: IdeaArtifact): IdeaScript {
  const lines: string[] = []

  if (artifact.language === 'tsx') {
    lines.push(
      `Разбираю ${artifact.fileName}. Компонент устроен по принципу «снаружи просто, внутри честно»:`,
    )
    lines.push('• Состояние — минимум: только то, что видит пользователь.')
    lines.push('• Побочные эффекты собраны в одном месте, чтобы их было легко тестировать.')
    lines.push('• Разметка читается как описание экрана, а не как инструкция для машины.')
  } else if (artifact.language === 'ts') {
    lines.push(`Разбираю ${artifact.fileName}:`)
    lines.push('• Вся логика — в чистых функциях и одном хуке, без глобального состояния.')
    lines.push('• Ошибки не выбрасываются наружу: интерфейс всегда получает понятный ответ.')
  } else {
    lines.push(`Разбираю ${artifact.fileName}:`)
    lines.push('• Один золотой акцент на главном действии — остальное приглушено.')
    lines.push('• Радиусы, тени и тайминги повторяются, поэтому экран выглядит цельным.')
  }

  lines.push('Если что-то из этого лишнее для твоего проекта — скажи, упрощу.')
  lines.push('Чего изволите дальше?')

  return {
    segments: [{ type: 'text', stage: null, text: lines.join(' ') }],
    suggestions: BASE_SUGGESTIONS,
  }
}
