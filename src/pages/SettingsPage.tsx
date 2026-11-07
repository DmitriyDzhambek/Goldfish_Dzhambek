/**
 * Настройки: API-ключ для своей LLM и аккаунт.
 * Ключ хранится только в localStorage этого браузера.
 */

import { useState } from 'react'
import { Check, Eye, EyeOff, KeyRound } from 'lucide-react'
import { readStorage, writeStorage } from '../lib/storage'
import { AccountPage, type AuthNotice } from './AccountPage'
import styles from './SettingsPage.module.css'

const API_KEY_STORAGE = 'zr:settings:apikey'

interface SettingsPageProps {
  notice: AuthNotice | null
  onDismissNotice: () => void
  onNavigateHome: () => void
}

export function SettingsPage({ notice, onDismissNotice, onNavigateHome }: SettingsPageProps) {
  const [apiKey, setApiKey] = useState(() => readStorage(API_KEY_STORAGE, ''))
  const [visible, setVisible] = useState(false)
  const [saved, setSaved] = useState(false)

  function save(): void {
    writeStorage(API_KEY_STORAGE, apiKey.trim())
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Настройки</h1>
        <p className={styles.subtitle}>Минимум полей. Всё важное — под рукой.</p>
      </header>

      <section className={styles.card} aria-label="API-ключ">
        <div className={styles.cardHeader}>
          <KeyRound size={16} strokeWidth={1.8} className={styles.cardIcon} aria-hidden="true" />
          <h2 className={styles.cardTitle}>API-ключ</h2>
        </div>
        <p className={styles.cardNote}>
          Ключ передаётся только твоим запросам к модели и хранится локально в браузере.
          Оставь поле пустым — Рыбка будет работать на общих бесплатных моделях.
        </p>
        <div className={styles.keyRow}>
          <input
            className={styles.keyInput}
            type={visible ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
            aria-label="API-ключ"
          />
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setVisible((value) => !value)}
            aria-label={visible ? 'Скрыть ключ' : 'Показать ключ'}
          >
            {visible ? <EyeOff size={15} strokeWidth={1.8} aria-hidden="true" /> : <Eye size={15} strokeWidth={1.8} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={[styles.saveBtn, saved && styles.saved].filter(Boolean).join(' ')}
            onClick={save}
          >
            {saved ? (
              <>
                <Check size={14} strokeWidth={2.2} aria-hidden="true" />
                Сохранено
              </>
            ) : (
              'Сохранить'
            )}
          </button>
        </div>
      </section>

      <AccountPage notice={notice} onDismissNotice={onDismissNotice} onNavigate={onNavigateHome} />
    </div>
  )
}
