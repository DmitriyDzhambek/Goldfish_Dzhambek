/**
 * Общий клиент API. Все запросы к бэкенду идут только через этот файл,
 * чтобы обработка ошибок и базовый URL были в одном месте.
 */

import { getGuestId } from '../lib/guest'

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim()
export const API_BASE_URL = (configuredBase && configuredBase.length > 0
  ? configuredBase
  : '/api'
).replace(/\/+$/, '')

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = 'http_error'
  let message = `Запрос не удался (${response.status})`

  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    if (body.error?.code) code = body.error.code
    if (body.error?.message) message = body.error.message
  } catch {
    // Тело не JSON — оставляем запасное сообщение.
  }

  return new ApiError(response.status, code, message)
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  json?: unknown
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...init } = options
  const requestHeaders = new Headers(headers)

  if (!requestHeaders.has('Accept')) requestHeaders.set('Accept', 'application/json')
  if (!requestHeaders.has('X-Guest-Id')) requestHeaders.set('X-Guest-Id', getGuestId())
  if (json !== undefined) requestHeaders.set('Content-Type', 'application/json')

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders,
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  })

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T

  return (await response.json()) as T
}

/* ── Чат и SSE-стриминг ─────────────────────────────────────── */

export interface ChatRequest {
  sessionId: string
  message: string
  character?: 'fish' | 'kolobok'
  wishId?: string
}

export interface ChatStreamDelta {
  delta: string
}

export interface ChatStreamNotice {
  notice: string
}

export type ChatProvider = 'primary' | 'fallback' | 'ollama' | 'offline'

export interface ChatStreamDone {
  done: true
  provider?: ChatProvider
  usage?: {
    promptTokens?: number
    completionTokens?: number
  }
}

export interface ChatStreamError {
  error: {
    code: string
    message: string
  }
}

export type ChatStreamEvent =
  | ChatStreamDelta
  | ChatStreamNotice
  | ChatStreamDone
  | ChatStreamError

function parseEvent(raw: string): ChatStreamEvent {
  try {
    return JSON.parse(raw) as ChatStreamEvent
  } catch {
    throw new ApiError(502, 'bad_stream', 'Не удалось разобрать поток ответа')
  }
}

/**
 * Читает SSE-поток `data: {...}\n\n` и отдаёт события по мере поступления.
 * Отмена — через AbortSignal (кнопка «стоп» в чате).
 */
export async function* streamChat(
  request: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent, void, void> {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      'X-Guest-Id': getGuestId(),
    },
    body: JSON.stringify(request),
    ...(signal ? { signal } : {}),
  })

  if (!response.ok) throw await toApiError(response)

  const reader = response.body?.getReader()
  if (!reader) {
    throw new ApiError(response.status, 'stream_unavailable', 'Сервер не прислал поток ответа')
  }

  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')

        const data = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('')

        // Пустые keep-alive события и [DONE] пропускаем.
        if (data.length === 0 || data === '[DONE]') continue
        yield parseEvent(data)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/* ── Желания ────────────────────────────────────────────────── */

export type WishStatus = 'new' | 'in_progress' | 'done'

export interface WishStep {
  id: string
  title: string
  done: boolean
}

export interface Wish {
  id: string
  title: string
  note: string | null
  status: WishStatus
  /** 0–100, считается из выполненных шагов. */
  progress: number
  steps: WishStep[]
  createdAt: string
  updatedAt: string
}

export interface WishListResponse {
  wishes: Wish[]
}

export interface CreateWishInput {
  title: string
  note?: string
}

export interface UpdateWishInput {
  title?: string
  note?: string | null
  status?: WishStatus
  steps?: WishStep[]
}

/* ── Память ─────────────────────────────────────────────────── */

export type MemoryFactKind = 'name' | 'goal' | 'habit' | 'date' | 'other'

export interface MemoryFact {
  id: string
  kind: MemoryFactKind
  value: string
  createdAt: string
}

export interface MemoryResponse {
  facts: MemoryFact[]
  updatedAt: string | null
}

/* ── Публичный объект API ───────────────────────────────────── */

export const api = {
  wishes: {
    list: () => apiRequest<WishListResponse>('/wishes'),
    create: (input: CreateWishInput) =>
      apiRequest<Wish>('/wishes', { method: 'POST', json: input }),
    update: (id: string, patch: UpdateWishInput) =>
      apiRequest<Wish>(`/wishes/${encodeURIComponent(id)}`, { method: 'PATCH', json: patch }),
    remove: (id: string) =>
      apiRequest<void>(`/wishes/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    regeneratePlan: (id: string) =>
      apiRequest<Wish>(`/wishes/${encodeURIComponent(id)}/plan`, { method: 'POST' }),
  },
  memory: {
    get: () => apiRequest<MemoryResponse>('/memory'),
    put: (facts: MemoryFact[]) =>
      apiRequest<MemoryResponse>('/memory', { method: 'PUT', json: { facts } }),
  },
} as const
