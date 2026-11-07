import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type AuthMe } from '../api/client'
import { getGuestId } from '../lib/guest'

export interface AuthController {
  me: AuthMe | null
  loading: boolean
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
  login: () => void
  logout: () => Promise<void>
  clearError: () => void
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Не удалось проверить вход. Проверь соединение и попробуй ещё раз.'
}

/**
 * Аккаунт необязателен: гость получает весь функционал. Вход через Яндекс
 * нужен только для синхронизации желаний и памяти между устройствами.
 */
export function useAuth(): AuthController {
  const [me, setMe] = useState<AuthMe | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const meRef = useRef<AuthMe | null>(null)

  const apply = useCallback((next: AuthMe): void => {
    meRef.current = next
    setMe(next)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      apply(await api.auth.me())
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const login = useCallback((): void => {
    if (meRef.current && !meRef.current.oauthEnabled) {
      setError(
        'Вход через Яндекс пока не настроен на сервере. Гость получает весь функционал — регистрация не нужна.',
      )
      return
    }

    setError(null)
    window.location.assign(api.auth.yandexStartUrl(getGuestId()))
  }, [])

  const logout = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      await api.auth.logout()
      apply(
        meRef.current
          ? { ...meRef.current, authenticated: false, account: null, guest: true }
          : {
              authenticated: false,
              account: null,
              oauthEnabled: true,
              provider: 'yandex',
              guest: true,
            },
      )
      setError(null)
      await refresh()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }, [apply, refresh])

  const clearError = useCallback((): void => setError(null), [])

  return { me, loading, busy, error, refresh, login, logout, clearError }
}
