import { useRef, useState, type FormEvent } from 'react'
import { AlertCircle, Loader2, Mic, Plus, RefreshCw, Sparkles } from 'lucide-react'
import { CHARACTERS, type CharacterId } from '../characters'
import { GlassCard } from '../components/ui/GlassCard'
import { WishCard } from '../components/wishes/WishCard'
import { useSpeech } from '../hooks/useSpeech'
import { useWishes } from '../hooks/useWishes'
import styles from './WishesPage.module.css'

const MAX_TITLE = 280
const MAX_NOTE = 4000

const SUGGESTIONS = [
  'Начать бегать по утрам',
  'Сделать сайт-портфолио',
  'Выучить 100 английских слов',
  'Навести порядок в финансах',
]

interface WishesPageProps {
  character: CharacterId
}

export function WishesPage({ character }: WishesPageProps) {
  const meta = CHARACTERS[character]
  const [draftTitle, setDraftTitle] = useState('')
  const [draftNote, setDraftNote] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  const {
    supported,
    listening,
    interim,
    error: speechError,
    toggleListening,
    stopListening,
    clearError: clearSpeechError,
  } = useSpeech({
    onTranscript: (text) =>
      setDraftTitle((previous) =>
        (previous.trim() ? `${previous.trim()} ${text}` : text).slice(0, MAX_TITLE),
      ),
  })

  const {
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
  } = useWishes()

  const doneCount = wishes.reduce(
    (count, wish) => (wish.status === 'done' ? count + 1 : count),
    0,
  )
  const shownError = error ?? speechError

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    const title = draftTitle.trim()
    if (!title || creating) return

    if (listening) stopListening()

    const note = draftNote.trim()
    const wish = await create(note ? { title, note } : { title })

    if (wish) {
      setDraftTitle('')
      setDraftNote('')
      titleRef.current?.focus()
    }
  }

  const pickSuggestion = (suggestion: string): void => {
    setDraftTitle(suggestion)
    titleRef.current?.focus()
  }

  const dismissError = (): void => {
    clearError()
    clearSpeechError()
  }

  return (
    <section className={styles.page} aria-labelledby="wishes-title">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>невод → желание → исполнение</p>
        <h1 id="wishes-title" className={styles.title}>
          Желания
        </h1>
        <p className={styles.lead}>
          {meta.short} разложит желание на 3–7 шагов. Отмечай выполненное — прогресс
          посчитается сам. Без счётчиков и лимитов.
        </p>
        <ul className={styles.chips}>
          <li>∞ желаний</li>
          <li>план 3–7 шагов</li>
          <li>прогресс</li>
        </ul>
      </header>

      <div className={styles.grid}>
        <GlassCard className={styles.createCard}>
          <h2 className={styles.cardTitle}>Новое желание</h2>
          <p className={styles.cardHint}>
            Сформулируй, что хочешь изменить. Остальное — за рыбкой.
          </p>

          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field} htmlFor="wish-title">
              <span className={styles.label}>Желание</span>
              <input
                id="wish-title"
                ref={titleRef}
                className={styles.input}
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value.slice(0, MAX_TITLE))}
                maxLength={MAX_TITLE}
                placeholder={
                  character === 'fish' ? 'Чего изволите?' : 'Что задумал?'
                }
                autoComplete="off"
                required
              />
            </label>

            <label className={styles.field} htmlFor="wish-note">
              <span className={styles.label}>
                Заметка <span className={styles.optional}>необязательно</span>
              </span>
              <textarea
                id="wish-note"
                className={styles.textarea}
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value.slice(0, MAX_NOTE))}
                maxLength={MAX_NOTE}
                rows={2}
                placeholder="Срок, контекст, почему это важно"
              />
            </label>

            {(listening || interim) && (
              <p className={styles.interim} aria-live="polite">
                {interim || 'Слушаю… говори'}
              </p>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className={[styles.mic, listening && styles.micActive]
                  .filter(Boolean)
                  .join(' ')}
                onClick={toggleListening}
                aria-pressed={listening}
                aria-label={listening ? 'Остановить запись' : 'Сказать желание голосом'}
                disabled={!supported.recognition || creating}
                title={
                  supported.recognition
                    ? listening
                      ? 'Остановить запись'
                      : 'Сказать голосом'
                    : 'Распознавание речи недоступно в этом браузере'
                }
              >
                <Mic size={17} strokeWidth={2} aria-hidden="true" />
              </button>

              <button
                type="submit"
                className={styles.submit}
                disabled={!draftTitle.trim() || creating}
              >
                {creating ? (
                  <Loader2 className={styles.spin} size={16} strokeWidth={2} aria-hidden="true" />
                ) : (
                  <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                )}
                {creating ? 'Составляю план…' : 'Поймать желание'}
              </button>
            </div>
          </form>

          <div className={styles.suggestions}>
            {SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className={styles.suggestion}
                onClick={() => pickSuggestion(suggestion)}
                disabled={creating}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </GlassCard>

        <div className={styles.listArea}>
          <div className={styles.listHead}>
            <div>
              <h2 className={styles.listTitle}>
                {wishes.length > 0 ? 'Твои желания' : 'Пока пусто'}
              </h2>
              {wishes.length > 0 && (
                <p className={styles.listMeta}>
                  {wishes.length} · исполнено {doneCount}
                </p>
              )}
            </div>

            <button
              type="button"
              className={styles.refresh}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Обновить список желаний"
              title="Обновить"
            >
              <RefreshCw
                className={loading ? styles.spin : undefined}
                size={15}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          </div>

          {shownError && (
            <div className={styles.errorBar} role="alert">
              <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
              <span>{shownError}</span>
              <button type="button" onClick={dismissError}>
                Закрыть
              </button>
            </div>
          )}

          {loading && wishes.length === 0 ? (
            <GlassCard className={styles.stateCard}>
              <Loader2 className={styles.spin} size={18} strokeWidth={2} aria-hidden="true" />
              <p>Достаю желания со дна…</p>
            </GlassCard>
          ) : wishes.length === 0 ? (
            <GlassCard className={styles.stateCard}>
              <span className={styles.stateIcon} aria-hidden="true">
                <Sparkles size={18} strokeWidth={1.8} />
              </span>
              <p className={styles.stateTitle}>Здесь появится первое желание</p>
              <p className={styles.stateText}>
                Напиши его словами или скажи голосом — рыбка составит план, а ты
                отметишь первый шаг.
              </p>
            </GlassCard>
          ) : (
            <div className={styles.cards}>
              {wishes.map((wish) => (
                <WishCard
                  key={wish.id}
                  wish={wish}
                  busy={busyId === wish.id}
                  onToggleStep={(stepId) => void toggleStep(wish, stepId)}
                  onReplan={() => void replan(wish.id)}
                  onDelete={() => void remove(wish.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
