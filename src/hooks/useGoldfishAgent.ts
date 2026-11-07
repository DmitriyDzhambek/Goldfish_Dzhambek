import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  streamChat,
  type ChatProvider,
  type ChatStreamEvent,
} from '../api/client'
import type { CharacterId } from '../characters'
import { readStorage, writeStorage } from '../lib/storage'

export type ChatRole = 'user' | 'assistant'
export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'error'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  pending?: boolean
  failed?: boolean
}

const STORAGE_KEY = 'zr:chat:v1'
const MAX_STORED_MESSAGES = 80

interface StoredChat {
  sessionId: string
  messages: ChatMessage[]
}

let fallbackId = 0

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  fallbackId += 1
  return `msg-${Date.now()}-${fallbackId}`
}

function newSessionId(): string {
  return `zr-${newId()}`
}

function isMessage(value: unknown): value is ChatMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>

  return (
    typeof message.id === 'string' &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'string'
  )
}

function loadChat(): StoredChat {
  try {
    const parsed = JSON.parse(readStorage(STORAGE_KEY, '{}')) as Partial<StoredChat>
    const messages = Array.isArray(parsed.messages)
      ? parsed.messages.filter(isMessage).slice(-MAX_STORED_MESSAGES)
      : []

    return {
      sessionId:
        typeof parsed.sessionId === 'string' && parsed.sessionId
          ? parsed.sessionId
          : newSessionId(),
      messages,
    }
  } catch {
    return { sessionId: newSessionId(), messages: [] }
  }
}

function persistChat(sessionId: string, messages: ChatMessage[]): void {
  const snapshot = messages
    .filter((message) => !message.pending || message.content)
    .slice(-MAX_STORED_MESSAGES)

  writeStorage(STORAGE_KEY, JSON.stringify({ sessionId, messages: snapshot }))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Рыбка не услышала. Проверь соединение и попробуй ещё раз.'
}

export interface UseGoldfishAgentOptions {
  character: CharacterId
  /** Желание, к которому относится диалог: его план попадёт в контекст. */
  wishId?: string | null
  onAssistantDone?: (text: string, message: ChatMessage) => void
}

export interface GoldfishAgent {
  messages: ChatMessage[]
  status: AgentStatus
  notice: string | null
  provider: ChatProvider | null
  error: string | null
  busy: boolean
  send: (text: string) => Promise<void>
  stop: () => void
  reset: () => void
  clearError: () => void
}

/**
 * Состояние диалога: оптимистичные сообщения, SSE-стриминг, отмена,
 * сохранение в localStorage и восстановление сессии после перезагрузки.
 */
export function useGoldfishAgent({
  character,
  wishId = null,
  onAssistantDone,
}: UseGoldfishAgentOptions): GoldfishAgent {
  const initial = useRef<StoredChat | null>(null)
  if (initial.current === null) initial.current = loadChat()

  const [sessionId, setSessionId] = useState(initial.current.sessionId)
  const [messages, setMessages] = useState<ChatMessage[]>(initial.current.messages)
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [provider, setProvider] = useState<ChatProvider | null>(null)
  const [error, setError] = useState<string | null>(null)

  const messagesRef = useRef(messages)
  const sessionRef = useRef(sessionId)
  const abortRef = useRef<AbortController | null>(null)
  const onDoneRef = useRef(onAssistantDone)

  useEffect(() => {
    onDoneRef.current = onAssistantDone
  }, [onAssistantDone])

  useEffect(() => {
    sessionRef.current = sessionId
  }, [sessionId])

  const commit = useCallback((next: ChatMessage[]): void => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const patchMessage = useCallback(
    (id: string, patch: (message: ChatMessage) => ChatMessage): void => {
      commit(
        messagesRef.current.map((message) => (message.id === id ? patch(message) : message)),
      )
    },
    [commit],
  )

  const send = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim()
      if (!text) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const userMessage: ChatMessage = {
        id: newId(),
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      }
      const assistantMessage: ChatMessage = {
        id: newId(),
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
        pending: true,
      }

      const withMessages = [...messagesRef.current, userMessage, assistantMessage]
      commit(withMessages)
      persistChat(sessionRef.current, withMessages)

      setStatus('thinking')
      setError(null)
      setNotice(null)
      setProvider(null)

      let streamed = ''
      let finished = false

      try {
        for await (const event of streamChat(
          {
            sessionId: sessionRef.current,
            message: text,
            character,
            ...(wishId ? { wishId } : {}),
          },
          controller.signal,
        )) {
          if ('delta' in event) {
            streamed += event.delta
            setStatus('streaming')
            patchMessage(assistantMessage.id, (message) => ({
              ...message,
              content: message.content + event.delta,
              pending: true,
            }))
            continue
          }

          if ('notice' in event) {
            setNotice(event.notice)
            continue
          }

          if ('error' in event) {
            throw new ApiError(502, event.error.code, event.error.message)
          }

          if ('done' in event) {
            finished = true
            setProvider(event.provider ?? null)
          }
        }

        if (!streamed.trim()) {
          throw new ApiError(
            502,
            'empty_response',
            'Рыбка промолчала. Попробуй переформулировать желание.',
          )
        }

        patchMessage(assistantMessage.id, (message) => ({
          ...message,
          pending: false,
        }))
        setStatus('idle')
        persistChat(sessionRef.current, messagesRef.current)

        const finalMessage: ChatMessage = {
          ...assistantMessage,
          content: streamed,
          pending: false,
        }
        onDoneRef.current?.(streamed, finalMessage)
      } catch (caught) {
        const aborted =
          controller.signal.aborted ||
          (caught instanceof DOMException && caught.name === 'AbortError')

        const current = messagesRef.current.find(
          (message) => message.id === assistantMessage.id,
        )

        if (aborted) {
          if (current?.content) {
            patchMessage(assistantMessage.id, (message) => ({
              ...message,
              pending: false,
            }))
          } else {
            commit(messagesRef.current.filter((message) => message.id !== assistantMessage.id))
          }
          setStatus('idle')
          persistChat(sessionRef.current, messagesRef.current)
          return
        }

        const message = errorMessage(caught)
        setError(message)

        if (current?.content) {
          patchMessage(assistantMessage.id, (item) => ({
            ...item,
            pending: false,
            failed: true,
          }))
        } else {
          patchMessage(assistantMessage.id, (item) => ({
            ...item,
            content: message,
            pending: false,
            failed: true,
          }))
        }

        setStatus('error')
        persistChat(sessionRef.current, messagesRef.current)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        if (!finished && controller.signal.aborted) setStatus('idle')
      }
    },
    [character, commit, patchMessage, wishId],
  )

  const stop = useCallback((): void => {
    abortRef.current?.abort()
  }, [])

  const reset = useCallback((): void => {
    abortRef.current?.abort()
    abortRef.current = null

    const nextSession = newSessionId()
    sessionRef.current = nextSession
    setSessionId(nextSession)
    commit([])
    persistChat(nextSession, [])
    setStatus('idle')
    setNotice(null)
    setProvider(null)
    setError(null)
  }, [commit])

  const clearError = useCallback((): void => {
    setError(null)
    if (status === 'error') setStatus('idle')
  }, [status])

  return {
    messages,
    status,
    notice,
    provider,
    error,
    busy: status === 'thinking' || status === 'streaming',
    send,
    stop,
    reset,
    clearError,
  }
}

export type { ChatStreamEvent }
