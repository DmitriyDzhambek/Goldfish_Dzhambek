import { readStorage, writeStorage } from './storage'

const GUEST_KEY = 'zr:guest:id'
const VALID = /^[A-Za-z0-9_-]{8,128}$/

let cached: string | null = null

function generateGuestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '')
  }

  return `guest${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Стабильный анонимный идентификатор гостя.
 * Регистрация не нужна: он живёт в localStorage и присылается в `X-Guest-Id`.
 */
export function getGuestId(): string {
  if (cached) return cached

  const stored = readStorage(GUEST_KEY, '')
  if (VALID.test(stored)) {
    cached = stored
    return stored
  }

  const created = generateGuestId()
  writeStorage(GUEST_KEY, created)
  cached = created

  return created
}
