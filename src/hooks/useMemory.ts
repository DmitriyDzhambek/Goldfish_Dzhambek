import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type MemoryFact, type MemoryFactKind } from '../api/client'
import { clearGuestFacts, readGuestFacts, saveGuestFacts } from '../memory/guestMemory'

export interface MemoryController {
  facts: MemoryFact[]
  updatedAt: string | null
  loading: boolean
  saving: boolean
  offline: boolean
  error: string | null
  refresh: () => Promise<void>
  addFact: (kind: MemoryFactKind, value: string) => Promise<boolean>
  updateFact: (id: string, patch: { kind?: MemoryFactKind; value?: string }) => Promise<boolean>
  removeFact: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  clearError: () => void
}

function newFactId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `fact-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
  }
  return `fact-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function normalizeValue(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Не удалось сохранить память. Проверь соединение и попробуй ещё раз.'
}

function isDuplicate(facts: readonly MemoryFact[], kind: MemoryFactKind, value: string, exceptId?: string): boolean {
  const key = value.toLocaleLowerCase('ru-RU')
  return facts.some(
    (fact) =>
      fact.id !== exceptId &&
      fact.kind === kind &&
      fact.value.toLocaleLowerCase('ru-RU') === key,
  )
}

/**
 * Память пользователя: сервер — источник истины, localStorage — кэш
 * и запасной вариант, если сеть недоступна. Гость получает всю память
 * без регистрации; после входа факты переносятся в аккаунт.
 */
export function useMemory(): MemoryController {
  const cached = useRef<MemoryFact[] | null>(null)
  if (cached.current === null) cached.current = readGuestFacts()

  const [facts, setFacts] = useState<MemoryFact[]>(cached.current)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const factsRef = useRef(facts)

  const apply = useCallback((next: MemoryFact[], nextUpdatedAt: string | null): void => {
    factsRef.current = next
    setFacts(next)
    setUpdatedAt(nextUpdatedAt)
    saveGuestFacts(next)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await api.memory.get()
      apply(data.facts, data.updatedAt)
      setOffline(false)
      setError(null)
    } catch (caught) {
      setOffline(true)
      setError(
        factsRef.current.length > 0
          ? 'Сервер недоступен — показаны локальные факты. Изменения сохранятся здесь.'
          : errorMessage(caught),
      )
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const persist = useCallback(
    async (next: MemoryFact[]): Promise<boolean> => {
      // Сначала сохраняем локально: даже если сеть пропала, факт не потеряется.
      apply(next, updatedAt)
      setSaving(true)

      try {
        const data = await api.memory.put(next)
        apply(data.facts, data.updatedAt)
        setOffline(false)
        setError(null)
        return true
      } catch (caught) {
        setOffline(true)
        setError(
          `${errorMessage(caught)} Факт сохранён локально и отправится на сервер позже.`,
        )
        return false
      } finally {
        setSaving(false)
      }
    },
    [apply, updatedAt],
  )

  const addFact = useCallback(
    async (kind: MemoryFactKind, rawValue: string): Promise<boolean> => {
      const value = normalizeValue(rawValue)
      if (!value) {
        setError('Впиши факт — пустую строку запомнить нельзя.')
        return false
      }
      if (value.length > 2000) {
        setError('Факт слишком длинный: максимум 2000 символов.')
        return false
      }
      if (isDuplicate(factsRef.current, kind, value)) {
        setError('Такой факт уже есть в памяти.')
        return false
      }

      const fact: MemoryFact = {
        id: newFactId(),
        kind,
        value,
        createdAt: new Date().toISOString(),
      }
      return persist([fact, ...factsRef.current])
    },
    [persist],
  )

  const updateFact = useCallback(
    async (id: string, patch: { kind?: MemoryFactKind; value?: string }): Promise<boolean> => {
      const current = factsRef.current.find((fact) => fact.id === id)
      if (!current) return false

      const value = patch.value === undefined ? current.value : normalizeValue(patch.value)
      const kind = patch.kind ?? current.kind

      if (!value) {
        setError('Факт не может быть пустым.')
        return false
      }
      if (value.length > 2000) {
        setError('Факт слишком длинный: максимум 2000 символов.')
        return false
      }
      if (isDuplicate(factsRef.current, kind, value, id)) {
        setError('Такой факт уже есть в памяти.')
        return false
      }

      const next = factsRef.current.map((fact) =>
        fact.id === id ? { ...fact, kind, value } : fact,
      )
      return persist(next)
    },
    [persist],
  )

  const removeFact = useCallback(
    async (id: string): Promise<void> => {
      await persist(factsRef.current.filter((fact) => fact.id !== id))
    },
    [persist],
  )

  const clearAll = useCallback(async (): Promise<void> => {
    setSaving(true)
    apply([], null)
    clearGuestFacts()

    try {
      await api.memory.remove()
      setOffline(false)
      setError(null)
    } catch (caught) {
      setOffline(true)
      setError(
        `${errorMessage(caught)} Локальная копия уже удалена, серверная — при следующей попытке.`,
      )
    } finally {
      setSaving(false)
    }
  }, [apply])

  const clearError = useCallback((): void => setError(null), [])

  return {
    facts,
    updatedAt,
    loading,
    saving,
    offline,
    error,
    refresh,
    addFact,
    updateFact,
    removeFact,
    clearAll,
    clearError,
  }
}
