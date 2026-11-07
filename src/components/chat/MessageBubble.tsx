import { useState } from 'react'
import { Check, Copy, Volume2 } from 'lucide-react'
import type { ChatMessage } from '../../hooks/useGoldfishAgent'
import { MessageText } from './MessageText'
import styles from './MessageBubble.module.css'

interface MessageBubbleProps {
  message: ChatMessage
  avatar: string
  name: string
  canSpeak: boolean
  onSpeak: (text: string) => void
}

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ')
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function MessageBubble({
  message,
  avatar,
  name,
  canSpeak,
  onSpeak,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const thinking = message.pending && !message.content

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // Буфер обмена может быть недоступен — молча пропускаем.
    }
  }

  return (
    <article
      className={classNames(
        styles.row,
        isUser ? styles.user : styles.assistant,
        message.failed && styles.failed,
      )}
      aria-label={isUser ? 'Твоё сообщение' : `Ответ: ${name}`}
    >
      {!isUser && (
        <span className={styles.avatar} aria-hidden="true">
          {avatar}
        </span>
      )}

      <div className={styles.wrap}>
        <div className={styles.bubble}>
          {thinking ? (
            <span className={styles.dots} aria-label="Рыбка думает">
              <i />
              <i />
              <i />
            </span>
          ) : isUser ? (
            <p className={styles.plain}>{message.content}</p>
          ) : (
            <MessageText text={message.content} />
          )}

          {message.pending && message.content && (
            <span className={styles.caret} aria-hidden="true" />
          )}
        </div>

        {!message.pending && message.content && (
          <div className={styles.meta}>
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>

            {!isUser && canSpeak && (
              <button
                type="button"
                className={styles.metaButton}
                onClick={() => onSpeak(message.content)}
                aria-label="Озвучить ответ"
                title="Озвучить"
              >
                <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              className={styles.metaButton}
              onClick={copy}
              aria-label={copied ? 'Скопировано' : 'Скопировать текст'}
              title={copied ? 'Скопировано' : 'Скопировать'}
            >
              {copied ? (
                <Check size={13} strokeWidth={2.4} aria-hidden="true" />
              ) : (
                <Copy size={13} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
