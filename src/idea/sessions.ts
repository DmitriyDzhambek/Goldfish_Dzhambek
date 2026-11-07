/**
 * История сессий «Студии идей» — архив запросов на вкладке «История».
 * Хранится в localStorage: ничего не уходит на сервер.
 */

import { writeStorage } from '../lib/storage'
import type { IdeaMessage } from './ideaEngine'

export interface IdeaSession {
  id: string
  /** Короткая тема — первая идея пользователя. */
  topic: string
  updatedAt: string
  messages: IdeaMessage[]
}

const SESSIONS_KEY = 'zr:idea:sessions'
const MAX_SESSIONS = 30

function isSession(value: unknown): value is IdeaSession {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Record<string, unknown>
  return (
    typeof session.id === 'string' &&
    typeof session.topic === 'string' &&
    typeof session.updatedAt === 'string' &&
    Array.isArray(session.messages)
  )
}

export function loadSessions(): IdeaSession[] {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isSession).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } catch {
    return []
  }
}

export function saveSession(session: IdeaSession): void {
  const rest = loadSessions().filter((item) => item.id !== session.id)
  const next = [session, ...rest].slice(0, MAX_SESSIONS)
  try {
    writeStorage(SESSIONS_KEY, JSON.stringify(next))
  } catch {
    // Хранилище может быть переполнено — история не критична.
  }
}

export function deleteSession(id: string): void {
  const next = loadSessions().filter((item) => item.id !== id)
  writeStorage(SESSIONS_KEY, JSON.stringify(next))
}

export function formatSessionDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'недавно'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
