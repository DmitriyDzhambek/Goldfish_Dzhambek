import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  Mic,
  RotateCcw,
  SendHorizontal,
  Sparkles,
  Square,
  Target,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react'
import type { Wish } from '../api/client'
import { CHARACTERS, type CharacterId } from '../characters'
import { MessageBubble } from '../components/chat/MessageBubble'
import { Goldfish, type GoldfishMood } from '../components/scene/Goldfish'
import { Kolobok } from '../components/scene/Kolobok'
import { GlassCard } from '../components/ui/GlassCard'
import { useGoldfishAgent } from '../hooks/useGoldfishAgent'
import { useSpeech } from '../hooks/useSpeech'
import styles from './ChatPage.module.css'

const MAX_MESSAGE = 8000

const SUGGESTIONS = [
  'Помоги спланировать мой день',
  'Хочу начать бегать по утрам',
  'Как найти время на свой проект?',
  'Придумай желание на неделю',
]

const CHIPS = ['∞ сообщений', 'без регистрации', 'голос ru-RU']

interface ChatPageProps {
  character: CharacterId
  /** Желания для селектора контекста. */
  wishes?: Wish[]
  /** Желание, выбранное в селекторе на уровне App. */
  wishId?: string | null
  onWishChange?: (wishId: string | null) => void
}

export function ChatPage({
  character,
  wishes = [],
  wishId = null,
  onWishChange,
}: ChatPageProps) {
  const reducedMotion = useReducedMotion()
  const meta = CHARACTERS[character]
  const activeWish = wishId ? wishes.find((wish) => wish.id === wishId) ?? null : null

  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const stickRef = useRef(true)
  const rafRef = useRef(0)

  const handleTranscript = useCallback((text: string): void => {
    setDraft((previous) => {
      const next = previous.trim() ? `${previous.trim()} ${text}` : text
      return next.slice(0, MAX_MESSAGE)
    })
  }, [])

  const {
    supported,
    listening,
    speaking,
    interim,
    error: speechError,
    voiceEnabled,
    toggleListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoice,
    clearError: clearSpeechError,
  } = useSpeech({ onTranscript: handleTranscript })

  const handleAssistantDone = useCallback(
    (text: string): void => {
      if (voiceEnabled) speak(text)
    },
    [speak, voiceEnabled],
  )

  const {
    messages,
    status,
    notice,
    provider,
    error: agentError,
    busy,
    send,
    stop,
    reset,
    clearError: clearAgentError,
  } = useGoldfishAgent({
    character,
    wishId: activeWish?.id ?? null,
    onAssistantDone: handleAssistantDone,
  })

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 168)}px`
  }, [draft])

  useEffect(() => {
    if (!stickRef.current) return

    window.cancelAnimationFrame(rafRef.current)
    rafRef.current = window.requestAnimationFrame(() => {
      const list = listRef.current
      if (list) list.scrollTop = list.scrollHeight
    })

    return () => window.cancelAnimationFrame(rafRef.current)
  }, [messages, status])

  useEffect(() => {
    return () => window.cancelAnimationFrame(rafRef.current)
  }, [])

  const handleScroll = (): void => {
    const list = listRef.current
    if (!list) return

    const distance = list.scrollHeight - list.scrollTop - list.clientHeight
    stickRef.current = distance < 96
  }

  const submit = (event?: FormEvent): void => {
    event?.preventDefault()
    const text = draft.trim()
    if (!text || busy) return

    setDraft('')
    stickRef.current = true
    if (listening) stopListening()
    if (speaking) stopSpeaking()
    void send(text)
  }

  const pickSuggestion = (text: string): void => {
    if (busy) return
    stickRef.current = true
    void send(text)
  }

  const startNewDialogue = (): void => {
    if (listening) stopListening()
    if (speaking) stopSpeaking()
    setDraft('')
    reset()
  }

  const dismissError = (): void => {
    clearAgentError()
    clearSpeechError()
  }

  const mood: GoldfishMood = listening
    ? 'listening'
    : speaking || status === 'streaming'
      ? 'speaking'
      : status === 'thinking'
        ? 'thinking'
        : 'idle'

  const statusState = busy ? 'busy' : status === 'error' || speechError ? 'error' : 'online'
  const statusLabel = listening
    ? 'слушает…'
    : speaking
      ? 'говорит…'
      : status === 'thinking'
        ? 'думает…'
        : status === 'streaming'
          ? 'пишет…'
          : status === 'error'
            ? 'связь прервалась'
            : provider === 'ollama'
              ? 'локальная модель'
              : provider === 'offline'
                ? 'офлайн-режим'
                : 'на связи'

  const shownError = agentError ?? speechError
  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant')
  const canSpeakLast = Boolean(supported.synthesis && lastAssistant?.content)

  return (
    <section className={styles.page} aria-labelledby="chat-title">
      <div className={styles.stage}>
        <p className={styles.eyebrow}>невод → желание → исполнение</p>
        <h1 id="chat-title" className={styles.title}>
          {meta.name}
        </h1>

        <div className={styles.character}>
          {character === 'fish' ? <Goldfish mood={mood} /> : <Kolobok />}
        </div>

        <p className={styles.lead}>{meta.lead}</p>

        <ul className={styles.chips}>
          {CHIPS.map((chip) => (
            <li key={chip}>{chip}</li>
          ))}
        </ul>
      </div>

      <GlassCard className={styles.chat}>
        <header className={styles.chatHead}>
          <div className={styles.identity}>
            <span className={styles.avatar} aria-hidden="true">
              {meta.emoji}
            </span>
            <div className={styles.identityText}>
              <span className={styles.chatName}>{meta.short}</span>
              <span className={styles.status} data-state={statusState}>
                {statusLabel}
              </span>
            </div>
          </div>

          <div className={styles.headActions}>
            {canSpeakLast && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => (speaking ? stopSpeaking() : speak(lastAssistant?.content ?? ''))}
                aria-label={speaking ? 'Остановить озвучку' : 'Озвучить последний ответ'}
                title={speaking ? 'Остановить озвучку' : 'Озвучить ответ'}
              >
                {speaking ? (
                  <VolumeX size={16} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Volume2 size={16} strokeWidth={2} aria-hidden="true" />
                )}
              </button>
            )}

            {messages.length > 0 && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={startNewDialogue}
                aria-label="Новый разговор"
                title="Новый разговор"
              >
                <RotateCcw size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        {notice && (
          <p className={styles.notice} role="status">
            <Waves size={13} strokeWidth={2} aria-hidden="true" />
            {notice}
          </p>
        )}

        <div
          ref={listRef}
          className={styles.messages}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={busy}
          onScroll={handleScroll}
        >
          {messages.length === 0 ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon} aria-hidden="true">
                <Sparkles size={18} strokeWidth={1.8} />
              </span>
              <p className={styles.emptyTitle}>С чего начнём?</p>
              <p className={styles.emptyText}>
                Скажи, что хочешь изменить — я помогу разложить это на шаги и не
                свернуть с пути.
              </p>
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => pickSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                avatar={meta.emoji}
                name={meta.short}
                canSpeak={supported.synthesis}
                onSpeak={speak}
              />
            ))
          )}
        </div>

        {shownError && (
          <div className={styles.errorBar} role="alert">
            <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
            <span>{shownError}</span>
            <button type="button" onClick={dismissError} aria-label="Скрыть сообщение об ошибке">
              Закрыть
            </button>
          </div>
        )}

        <form className={styles.composer} onSubmit={submit}>
          {wishes.length > 0 && (
            <div className={styles.context}>
              <label className={styles.contextLabel} htmlFor="chat-wish">
                <Target size={12} strokeWidth={2} aria-hidden="true" />
                Желание в фокусе
              </label>
              <select
                id="chat-wish"
                className={styles.contextSelect}
                value={activeWish?.id ?? ''}
                onChange={(event) => onWishChange?.(event.target.value || null)}
                disabled={busy}
                title={
                  activeWish
                    ? `${activeWish.title} · ${activeWish.progress}%`
                    : 'Рыбка ответит без привязки к желанию'
                }
              >
                <option value="">Без желания</option>
                {wishes.map((wish) => (
                  <option key={wish.id} value={wish.id}>
                    {wish.title} · {wish.progress}%
                  </option>
                ))}
              </select>
            </div>
          )}

          {(listening || interim) && (
            <p className={styles.interim} aria-live="polite">
              {interim || 'Слушаю… говори'}
            </p>
          )}

          <div className={styles.field}>
            <textarea
              ref={textareaRef}
              className={styles.input}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE))}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              rows={1}
              maxLength={MAX_MESSAGE}
              placeholder={
                character === 'fish' ? 'Скажи желание, странник…' : 'Что задумал?'
              }
              aria-label="Сообщение для рыбки"
              enterKeyHint="send"
            />

            <button
              type="button"
              className={[styles.mic, listening && styles.micActive].filter(Boolean).join(' ')}
              onClick={toggleListening}
              aria-pressed={listening}
              aria-label={listening ? 'Остановить запись' : 'Сказать голосом'}
              title={
                supported.recognition
                  ? listening
                    ? 'Остановить запись'
                    : 'Сказать голосом'
                  : 'Распознавание речи недоступно в этом браузере'
              }
              disabled={!supported.recognition || busy}
            >
              <Mic size={18} strokeWidth={2} aria-hidden="true" />
            </button>

            {busy ? (
              <button
                type="button"
                className={styles.stop}
                onClick={stop}
                aria-label="Остановить ответ"
                title="Остановить ответ"
              >
                <Square size={15} strokeWidth={2.4} aria-hidden="true" />
              </button>
            ) : (
              <button
                type="submit"
                className={styles.send}
                disabled={!draft.trim()}
                aria-label="Отправить сообщение"
                title="Отправить"
              >
                <SendHorizontal size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className={styles.composerMeta}>
            <button
              type="button"
              className={[styles.voice, voiceEnabled && styles.voiceOn]
                .filter(Boolean)
                .join(' ')}
              onClick={toggleVoice}
              aria-pressed={voiceEnabled}
              disabled={!supported.synthesis}
              title={
                supported.synthesis
                  ? 'Озвучивать ответы голосом'
                  : 'Синтез речи недоступен в этом браузере'
              }
            >
              {voiceEnabled ? (
                <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
              ) : (
                <VolumeX size={13} strokeWidth={2} aria-hidden="true" />
              )}
              Озвучивать
            </button>

            <span className={styles.hint}>
              {draft.length > 0
                ? `${draft.length} / ${MAX_MESSAGE}`
                : reducedMotion
                  ? 'Enter — отправить'
                  : 'Enter — отправить · Shift+Enter — строка'}
            </span>
          </div>
        </form>
      </GlassCard>
    </section>
  )
}
