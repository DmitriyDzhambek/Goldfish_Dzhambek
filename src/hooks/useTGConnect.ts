/**
 * TGConnect — авторизация через Telegram.
 *
 * Пользователь быстро и безопасно входит на сайт своим Telegram-аккаунтом:
 *  a) внутри Telegram — Mini App: данные приходят в
 *     `window.Telegram.WebApp.initDataUnsafe.user`;
 *  b) в обычном браузере — Telegram Login Widget: он вызывает глобальный
 *     `window.onTelegramAuth(user)`, данные сохраняются в localStorage
 *     под ключом `tgconnect_user`, и React-состояние обновляется мгновенно.
 *
 * Права: `isAdmin` сверяет Telegram ID с `VITE_ADMIN_ID`
 * (запасной ID захардкожен для владельца приложения).
 */

import { useCallback, useEffect, useState } from 'react'

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  photo_url?: string
  username?: string
  auth_date?: number
}

const USER_KEY = 'tgconnect_user'
/** Старый ключ проекта: читаем один раз для миграции, чтобы не разлогинить пользователей. */
const LEGACY_USER_KEY = 'kolobok_web_user'

/** Telegram ID владельца — замени на свой или задай VITE_ADMIN_ID. */
const FALLBACK_ADMIN_ID = 111111111

/** Имя бота для Telegram Login Widget (LoginScreen). */
export const TELEGRAM_BOT_NAME = 'DzhTrandingbot'

/** Событие «пользователь вошёл через виджет» — синхронизирует все хуки. */
const AUTH_EVENT = 'tgconnect:auth'

function isUser(value: unknown): value is TelegramUser {
  if (typeof value !== 'object' || value === null) return false
  const user = value as Record<string, unknown>
  return (
    typeof user.id === 'number' &&
    typeof user.first_name === 'string' &&
    (user.photo_url === undefined || typeof user.photo_url === 'string') &&
    (user.username === undefined || typeof user.username === 'string')
  )
}

function readMiniAppUser(): TelegramUser | null {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user
  return isUser(user) ? user : null
}

function readWebUser(): TelegramUser | null {
  try {
    const raw =
      window.localStorage.getItem(USER_KEY) ?? window.localStorage.getItem(LEGACY_USER_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isUser(parsed) ? parsed : null
  } catch {
    return null
  }
}

function resolveUser(): TelegramUser | null {
  return readMiniAppUser() ?? readWebUser()
}

declare global {
  interface Window {
    Telegram?: { WebApp?: { initDataUnsafe?: { user?: TelegramUser } } }
    onTelegramAuth?: (user: TelegramUser) => void
  }
}

// Виджет Telegram ищет эту функцию на window после входа во всплывающем окне.
if (typeof window !== 'undefined' && window.onTelegramAuth === undefined) {
  window.onTelegramAuth = (user) => {
    if (!isUser(user)) return
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch {
      // Хранилище недоступно — пользователь всё равно войдёт на эту сессию.
    }
    window.dispatchEvent(new Event(AUTH_EVENT))
  }
}

export interface TGConnectSession {
  user: TelegramUser | null
  isAdmin: boolean
  /** Пользователь известен: Mini App или веб-логин через виджет. */
  isAuthenticated: boolean
  /** Приложение открыто внутри Telegram, а не в обычном браузере. */
  isMiniApp: boolean
  logout: () => void
}

function adminId(): number {
  const fromEnv = Number(import.meta.env.VITE_ADMIN_ID)
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : FALLBACK_ADMIN_ID
}

export function useTGConnect(): TGConnectSession {
  // Mini App отдаёт пользователя синхронно; в браузере начинаем с localStorage.
  const [user, setUser] = useState<TelegramUser | null>(() => resolveUser())

  useEffect(() => {
    const sync = (): void => setUser(resolveUser())
    window.addEventListener(AUTH_EVENT, sync)
    return () => window.removeEventListener(AUTH_EVENT, sync)
  }, [])

  const logout = useCallback((): void => {
    try {
      window.localStorage.removeItem(USER_KEY)
    } catch {
      // Молча: выход — не критичный путь.
    }
    setUser(readMiniAppUser())
  }, [])

  return {
    user,
    isAdmin: user !== null && user.id === adminId(),
    isAuthenticated: user !== null,
    isMiniApp: readMiniAppUser() !== null,
    logout,
  }
}
