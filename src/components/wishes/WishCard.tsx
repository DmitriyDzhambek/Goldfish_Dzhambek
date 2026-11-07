import { useState } from 'react'
import { Check, MessageCircle, RotateCw, Sparkles, Trash2, X } from 'lucide-react'
import type { Wish, WishStatus } from '../../api/client'
import styles from './WishCard.module.css'

const STATUS_LABEL: Record<WishStatus, string> = {
  new: 'новое',
  in_progress: 'в работе',
  done: 'исполнено',
}

interface WishCardProps {
  wish: Wish
  busy: boolean
  onToggleStep: (stepId: string) => void
  onReplan: () => void
  onDelete: () => void
  onDiscuss: () => void
}

export function WishCard({
  wish,
  busy,
  onToggleStep,
  onReplan,
  onDelete,
  onDiscuss,
}: WishCardProps) {
  const [confirming, setConfirming] = useState(false)
  const done = wish.status === 'done'

  return (
    <article
      className={[styles.card, done && styles.done].filter(Boolean).join(' ')}
      aria-label={`Желание: ${wish.title}`}
    >
      <header className={styles.head}>
        <span className={styles.status} data-status={wish.status}>
          {done && <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />}
          {STATUS_LABEL[wish.status]}
        </span>

        <div className={styles.actions}>
          {confirming ? (
            <>
              <button
                type="button"
                className={styles.confirm}
                onClick={onDelete}
                disabled={busy}
              >
                Удалить
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setConfirming(false)}
                aria-label="Отменить удаление"
                title="Отменить"
              >
                <X size={15} strokeWidth={2} aria-hidden="true" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setConfirming(true)}
              aria-label="Удалить желание"
              title="Удалить"
            >
              <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <h3 className={styles.title}>{wish.title}</h3>
      {wish.note && <p className={styles.note}>{wish.note}</p>}

      <div className={styles.progressRow}>
        <div
          className={styles.track}
          role="progressbar"
          aria-valuenow={wish.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Прогресс: ${wish.progress}%`}
        >
          <span style={{ width: `${Math.max(0, Math.min(100, wish.progress))}%` }} />
        </div>
        <span className={styles.percent}>{wish.progress}%</span>
      </div>

      <ul className={styles.steps}>
        {wish.steps.map((step) => (
          <li key={step.id}>
            <label
              className={[styles.step, step.done && styles.stepDone].filter(Boolean).join(' ')}
            >
              <input
                type="checkbox"
                checked={step.done}
                disabled={busy}
                onChange={() => onToggleStep(step.id)}
              />
              <span className={styles.box} aria-hidden="true">
                {step.done && <Check size={11} strokeWidth={3} />}
              </span>
              <span className={styles.stepText}>{step.title}</span>
            </label>
          </li>
        ))}
      </ul>

      <footer className={styles.foot}>
        <div className={styles.footActions}>
          <button
            type="button"
            className={styles.discuss}
            onClick={onDiscuss}
            title="Открыть чат с планом этого желания"
          >
            <MessageCircle size={13} strokeWidth={2} aria-hidden="true" />
            Обсудить с рыбкой
          </button>

          <button
            type="button"
            className={styles.replan}
            onClick={onReplan}
            disabled={busy}
            title="Составить новый план из шагов"
          >
            <RotateCw size={13} strokeWidth={2} aria-hidden="true" />
            Перепланировать
          </button>
        </div>

        {done && (
          <p className={styles.congrats} role="status">
            <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
            Желание исполнено
          </p>
        )}
      </footer>
    </article>
  )
}
