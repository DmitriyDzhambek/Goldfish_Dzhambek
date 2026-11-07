/**
 * Дневник Идей (Project Vault) — личный архив пользователя.
 *
 * Пользователь сохраняет «золотые» ответы Рыбки: план и код уезжают
 * в localStorage под ключом `kolobok_fish_vault_${userId}`, откуда их
 * можно в любой момент скопировать в свой редактор или обратно в чат.
 * userId — стабильный гостевой идентификатор из `lib/guest.ts`.
 */

import { getGuestId } from '../lib/guest'
import { readStorage, writeStorage } from '../lib/storage'
import { uid } from './ideaEngine'

export interface VaultEntry {
  id: string
  /** Человекочитаемый заголовок: тема идеи + имя файла. */
  title: string
  /** Текстовая часть ответа: видение и стек до блока кода. */
  plan: string
  /** Код артеффакта. */
  code: string
  /** ISO-дата сохранения. */
  date: string
  fileName: string
  language: string
}

const MAX_ENTRIES = 50

export function vaultKey(userId: string): string {
  return `kolobok_fish_vault_${userId}`
}

export function buildVaultEntry(input: {
  title: string
  plan: string
  code: string
  fileName: string
  language: string
}): VaultEntry {
  return {
    id: uid('vault'),
    title: input.title,
    plan: input.plan,
    code: input.code,
    date: new Date().toISOString(),
    fileName: input.fileName,
    language: input.language,
  }
}

function isEntry(value: unknown): value is VaultEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.title === 'string' &&
    typeof entry.plan === 'string' &&
    typeof entry.code === 'string' &&
    typeof entry.date === 'string' &&
    typeof entry.fileName === 'string' &&
    typeof entry.language === 'string'
  )
}

/** Дневник текущего пользователя: новее — выше. */
export function loadVault(userId: string = getGuestId()): VaultEntry[] {
  try {
    const raw = readStorage(vaultKey(userId), '')
    if (raw.length === 0) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isEntry)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

/** Добавляет запись наверх дневника (дедупликация по id). */
export function saveVaultEntry(userId: string, entry: VaultEntry): void {
  const rest = loadVault(userId).filter((item) => item.id !== entry.id)
  const next = [entry, ...rest].slice(0, MAX_ENTRIES)
  writeStorage(vaultKey(userId), JSON.stringify(next))
}

export function removeVaultEntry(userId: string, id: string): void {
  const next = loadVault(userId).filter((item) => item.id !== id)
  writeStorage(vaultKey(userId), JSON.stringify(next))
}

export function clearVault(userId: string): void {
  writeStorage(vaultKey(userId), JSON.stringify([]))
}

export function formatVaultDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'недавно'
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/** Полный текст задачи — то, что уезжает в буфер по кнопке «Скопировать». */
export function entryToText(entry: VaultEntry): string {
  const plan = entry.plan.trim().length > 0 ? entry.plan.trim() : '—'
  const code = entry.code.trim().length > 0 ? entry.code.trim() : '// код не сохранён'
  return [
    `# ${entry.title}`,
    `Дата: ${formatVaultDate(entry.date)}`,
    '',
    '## План',
    plan,
    '',
    `## Код — ${entry.fileName}`,
    '```' + entry.language,
    code,
    '```',
  ].join('\n')
}

/** Копирование с запасным путём через execCommand (iframe, старые браузеры). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      const ok = document.execCommand('copy')
      textarea.remove()
      return ok
    } catch {
      return false
    }
  }
}
