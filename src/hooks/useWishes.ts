import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type CreateWishInput, type Wish } from '../api/client'
import { readStorage, writeStorage } from '../lib/storage'
import { computeProgress, nextWishStatus } from '../wishes/progress'

const CACHE_KEY = 'zr:wishes:v1'
const MAX_CACHED = 100

function isWish(value: unknown): value is Wish {
  if (typeof value !== 'object' || value === null) return false
  const wish = value as Record<string, unknown>

  return (
    typeof wish.id === 'string' &&
    typeof wish.title === 'string' &&
    typeof wish.status === 'string' &&
    typeof wish.progress === 'number' &&
    Array.isArray(wish.steps) &&
    typeof wish.createdAt === 'string' &&
    typeof wish.updatedAt === 'string'
  )
}

function readCache(): Wish[] {
  try {
    const parsed: unknown = JSON.parse(readStorage(CACHE_KEY, '[]'))
    return Array.isArray(parsed) ? parsed.filter(isWish).slice(0, MAX_CACHED) : []
  } catch {
    return []
  }
}

function writeCache(wishes: readonly Wish[]): void {
  writeStorage(CACHE_KEY, JSON.stringify(wishes.slice(0, MAX_CACHED)))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Рыбка не смогла достать желания. Проверь соединение и попробуй ещё раз.'
}

export interface WishesController {
  wishes: Wish[]
  loading: boolean
  creating: boolean
  busyId: string | null
  error: string | null
  refresh: () => Promise<void>
  create: (input: CreateWishInput) => Promise<Wish | null>
  toggleStep: (wish: Wish, stepId: string) => Promise<void>
  replan: (wishId: string) => Promise<void>
  remove: (wishId: string) => Promise<void>
  clearError: () => void
}

/**
 * Желания гостя: сервер — источник истины, localStorage — быстрый кэш
 * и запасной вариант, если сеть пропала.
 */
export function useWishes(): WishesController {
  const [wishes, setWishes] = useState<Wish[]>(() => readCache())
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const wishesRef = useRef(wishes)

  const apply = useCallback((next: Wish[]): void => {
    wishesRef.current = next
    setWishes(next)
    writeCache(next)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await api.wishes.list()
      apply(data.wishes)
      setError(null)
    } catch (caught) {
      if (wishesRef.current.length === 0) setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const create = useCallback(
    async (input: CreateWishInput): Promise<Wish | null> => {
      setCreating(true)
      setError(null)

      try {
        const wish = await api.wishes.create(input)
        apply([wish, ...wishesRef.current])
        return wish
      } catch (caught) {
        setError(errorMessage(caught))
        return null
      } finally {
        setCreating(false)
      }
    },
    [apply],
  )

  const toggleStep = useCallback(
    async (wish: Wish, stepId: string): Promise<void> => {
      const previous = wishesRef.current
      const steps = wish.steps.map((step) =>
        step.id === stepId ? { ...step, done: !step.done } : step,
      )
      const progress = computeProgress(steps)

      apply(
        previous.map((item) =>
          item.id === wish.id
            ? {
                ...item,
                steps,
                progress,
                status: nextWishStatus(progress, item.status),
              }
            : item,
        ),
      )

      setBusyId(wish.id)
      try {
        const updated = await api.wishes.update(wish.id, { steps })
        apply(wishesRef.current.map((item) => (item.id === updated.id ? updated : item)))
        setError(null)
      } catch (caught) {
        apply(previous)
        setError(errorMessage(caught))
      } finally {
        setBusyId(null)
      }
    },
    [apply],
  )

  const replan = useCallback(
    async (wishId: string): Promise<void> => {
      setBusyId(wishId)
      setError(null)

      try {
        const updated = await api.wishes.regeneratePlan(wishId)
        apply(wishesRef.current.map((item) => (item.id === updated.id ? updated : item)))
      } catch (caught) {
        setError(errorMessage(caught))
      } finally {
        setBusyId(null)
      }
    },
    [apply],
  )

  const remove = useCallback(
    async (wishId: string): Promise<void> => {
      const previous = wishesRef.current
      apply(previous.filter((item) => item.id !== wishId))

      setBusyId(wishId)
      try {
        await api.wishes.remove(wishId)
        setError(null)
      } catch (caught) {
        apply(previous)
        setError(errorMessage(caught))
      } finally {
        setBusyId(null)
      }
    },
    [apply],
  )

  const clearError = useCallback((): void => setError(null), [])

  return {
    wishes,
    loading,
    creating,
    busyId,
    error,
    refresh,
    create,
    toggleStep,
    replan,
    remove,
    clearError,
  }
}
