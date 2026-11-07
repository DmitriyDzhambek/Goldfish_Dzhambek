import type { Wish, WishStatus, WishStep } from '../api/client'

/**
 * Прогресс всегда выводится из шагов — тот же принцип, что и на бэкенде.
 * Клиент не присылает произвольные проценты.
 */
export function computeProgress(steps: readonly WishStep[]): number {
  if (steps.length === 0) return 0
  const done = steps.reduce((count, step) => (step.done ? count + 1 : count), 0)
  return Math.max(0, Math.min(100, Math.round((done / steps.length) * 100)))
}

export function nextWishStatus(progress: number, current: WishStatus): WishStatus {
  if (current === 'done') return 'done'
  if (progress >= 100) return 'done'
  if (progress > 0) return 'in_progress'
  return 'new'
}

export function isWishComplete(wish: Pick<Wish, 'progress'>): boolean {
  return wish.progress >= 100
}
