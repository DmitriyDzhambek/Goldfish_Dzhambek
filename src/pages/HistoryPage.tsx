/**
 * История: архив сессий «Студии идей».
 * Только локальные данные — можно открыть диалог снова или удалить.
 */

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { MessageSquareQuote, Trash2 } from 'lucide-react'
import { deleteSession, formatSessionDate, loadSessions, type IdeaSession } from '../idea/sessions'
import styles from './HistoryPage.module.css'

const EASE = [0.22, 0.61, 0.36, 1] as const

interface HistoryPageProps {
  onOpenSession: (session: IdeaSession) => void
}

function lastAssistantSnippet(session: IdeaSession): string {
  const last = [...session.messages].reverse().find((m) => m.role === 'assistant' && m.text.length > 0)
  return last ? last.text.slice(0, 140) : 'Диалог без ответа'
}

export function HistoryPage({ onOpenSession }: HistoryPageProps) {
  const [sessions, setSessions] = useState<IdeaSession[]>(() => loadSessions())

  const remove = useCallback((id: string) => {
    deleteSession(id)
    setSessions(loadSessions())
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>История</h1>
        <p className={styles.subtitle}>Твои идеи не исчезают. Любую можно открыть и продолжить.</p>
      </header>

      {sessions.length === 0 ? (
        <div className={styles.empty}>
          <MessageSquareQuote size={28} strokeWidth={1.4} aria-hidden="true" />
          <p>Пока пусто. Расскажи Рыбке первую идею — она появится здесь.</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {sessions.map((session, index) => (
            <motion.li
              key={session.id}
              className={styles.card}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
            >
              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>{session.topic}</h2>
                <p className={styles.snippet}>{lastAssistantSnippet(session)}…</p>
                <span className={styles.meta}>
                  {formatSessionDate(session.updatedAt)} · {session.messages.length} сообщений
                </span>
              </div>
              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={styles.open}
                  onClick={() => onOpenSession(session)}
                >
                  Открыть
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => remove(session.id)}
                  aria-label={`Удалить «${session.topic}»`}
                >
                  <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  )
}
