/**
 * Дневник Визионера — личные записи пользователя с откликом Рыбки.
 *
 * Хранение: localStorage, ключ `kolobok_diary_${userId}`, где userId —
 * Telegram ID из useTGConnect (для авторизованных) либо стабильный
 * гостевой идентификатор из `lib/guest.ts` (до входа).
 *
 * `addEntry(text)` сохраняет запись и тут же отправляет её в LLM
 * с режимом `diary` — Рыбка отвечает одной короткой репликой
 * (поддержка или конкретный следующий шаг для идеи).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { streamChat } from '../api/client'
import { getGuestId } from '../lib/guest'
import { useTGConnect } from './useTGConnect'

export type DiaryEntryStatus = 'pending' | 'done' | 'error'

export interface DiaryEntry {
  id: string
  /** Текст записи пользователя. */
  text: string
  /** Ответ Рыбки (пустой, пока статус `pending`). */
  reply: string
  status: DiaryEntryStatus
  /** ISO-дата создания. */
  createdAt: string
}

const MAX_ENTRIES = 100

const OFFLINE_REPLY =
  'Волна до берега не дошла — сеть штормит. Запись сохранена, а я отвечу, когда связь вернётся.'

let seq = 0

function newId(): string {
  seq += 1
  return `diary-${Date.now().toString(36)}-${seq}`
}

export function diaryKey(userId: string): string {
  return `kolobok_diary_${userId}`
}

function isEntry(value: unknown): value is DiaryEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.text === 'string' &&
    typeof entry.reply === 'string' &&
    (entry.status === 'pending' || entry.status === 'done' || entry.status === 'error') &&
    typeof entry.createdAt === 'string'
  )
}

function readEntries(userId: string): DiaryEntry[] {
  try {
    const raw = window.localStorage.getItem(diaryKey(userId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

function writeEntries(userId: string, entries: DiaryEntry[]): void {
  try {
    window.localStorage.setItem(diaryKey(userId), JSON.stringify(entries.slice(0, MAX_ENTRIES)))
  } catch {
    // Хранилище может быть переполнено — дневник не критичный путь.
  }
}

export interface Diary {
  entries: DiaryEntry[]
  busy: boolean
  error: string | null
  addEntry: (text: string) => Promise<void>
  getEntries: () => DiaryEntry[]
  deleteEntry: (id: string) => void
}

export function useDiary(): Diary {
  const { user } = useTGConnect()
  const userId = user !== null ? `tg${user.id}` : getGuestId()
  const [entries, setEntries] = useState<DiaryEntry[]>(() => readEntries(userId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const userIdRef = useRef(userId)

  useEffect(() => {
    userIdRef.current = userId
  }, [userId])

  useEffect(() => () => abortRef.current?.abort(), [])

  const persist = useCallback((next: DiaryEntry[]): void => {
    setEntries(next)
    writeEntries(userIdRef.current, next)
  }, [])

  const getEntries = useCallback((): DiaryEntry[] => {
    const fresh = readEntries(userIdRef.current)
    setEntries(fresh)
    return fresh
  }, [])

  const deleteEntry = useCallback(
    (id: string): void => {
      persist(readEntries(userIdRef.current).filter((entry) => entry.id !== id))
    },
    [persist],
  )

  const addEntry = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim()
      if (text.length === 0 || busy) return

      const entry: DiaryEntry = {
        id: newId(),
        text,
        reply: '',
        status: 'pending',
        createdAt: new Date().toISOString(),
      }
      persist([entry, ...readEntries(userIdRef.current)].slice(0, MAX_ENTRIES))
      setBusy(true)
      setError(null)

      const controller = new AbortController()
      abortRef.current = controller

      let reply = ''
      try {
        for await (const event of streamChat(
          {
            // Отдельная сессия: дневник не подмешивается в историю чата.
            sessionId: `diary-${entry.id}`,
            message: text,
            mode: 'diary',
          },
          controller.signal,
        )) {
          if ('delta' in event) {
            reply += event.delta
            persist(
              readEntries(userIdRef.current).map((item) =>
                item.id === entry.id ? { ...item, reply } : item,
              ),
            )
          }
          if ('error' in event) {
            throw new Error(event.error.message)
          }
        }

        const finalReply = reply.trim().length > 0 ? reply.trim() : OFFLINE_REPLY
        persist(
          readEntries(userIdRef.current).map((item) =>
            item.id === entry.id ? { ...item, reply: finalReply, status: 'done' } : item,
          ),
        )
      } catch (caught) {
        const aborted = controller.signal.aborted
        const fallback =
          caught instanceof Error && caught.message.length > 0 ? caught.message : OFFLINE_REPLY
        persist(
          readEntries(userIdRef.current).map((item) =>
            item.id === entry.id
              ? { ...item, reply: aborted ? item.reply : fallback, status: 'error' }
              : item,
          ),
        )
        setError(aborted ? null : fallback)
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
      }
    },
    [busy, persist],
  )

  return { entries, busy, error, addEntry, getEntries, deleteEntry }
}
