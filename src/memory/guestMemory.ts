import type { MemoryFact, MemoryFactKind } from '../api/client'
import { readStorage, writeStorage } from '../lib/storage'

/**
 * Гостевая память в localStorage. На этапе 4 эти же факты
 * перенесутся в аккаунт после входа по magic link — без потери данных.
 */
const STORAGE_KEY = 'zr:memory'

const KINDS = new Set<MemoryFactKind>(['name', 'goal', 'habit', 'date', 'other'])

function isMemoryFact(value: unknown): value is MemoryFact {
  if (typeof value !== 'object' || value === null) return false
  const fact = value as Record<string, unknown>

  return (
    typeof fact.id === 'string' &&
    typeof fact.value === 'string' &&
    typeof fact.createdAt === 'string' &&
    typeof fact.kind === 'string' &&
    KINDS.has(fact.kind as MemoryFactKind)
  )
}

export function readGuestFacts(): MemoryFact[] {
  try {
    const parsed: unknown = JSON.parse(readStorage(STORAGE_KEY, '[]'))
    return Array.isArray(parsed) ? parsed.filter(isMemoryFact) : []
  } catch {
    return []
  }
}

export function saveGuestFacts(facts: readonly MemoryFact[]): void {
  writeStorage(STORAGE_KEY, JSON.stringify(facts))
}

export function clearGuestFacts(): void {
  writeStorage(STORAGE_KEY, '[]')
}
