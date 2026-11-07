import { useState, type FormEvent } from 'react'
import {
  AlertCircle,
  CalendarHeart,
  Check,
  Download,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat2,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { MemoryFact, MemoryFactKind } from '../api/client'
import { GlassCard } from '../components/ui/GlassCard'
import { useMemory } from '../hooks/useMemory'
import styles from './MemoryPage.module.css'

const MAX_VALUE = 2000

const KINDS: ReadonlyArray<{ id: MemoryFactKind; label: string; icon: LucideIcon }> = [
  { id: 'name', label: 'Имя', icon: UserRound },
  { id: 'goal', label: 'Цель', icon: Target },
  { id: 'habit', label: 'Привычка', icon: Repeat2 },
  { id: 'date', label: 'Дата', icon: CalendarHeart },
  { id: 'other', label: 'Другое', icon: Sparkles },
]

const KIND_LABEL: Record<MemoryFactKind, string> = {
  name: 'Имя',
  goal: 'Цель',
  habit: 'Привычка',
  date: 'Дата',
  other: 'Другое',
}

const KIND_ICON: Record<MemoryFactKind, LucideIcon> = {
  name: UserRound,
  goal: Target,
  habit: Repeat2,
  date: CalendarHeart,
  other: Sparkles,
}

function formatDate(value: string | null): string {
  if (!value) return 'ещё не сохранялась'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'недавно'

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

interface FactRowProps {
  fact: MemoryFact
  saving: boolean
  onSave: (id: string, patch: { kind: MemoryFactKind; value: string }) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}

function FactRow({ fact, saving, onSave, onDelete }: FactRowProps) {
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [kind, setKind] = useState<MemoryFactKind>(fact.kind)
  const [value, setValue] = useState(fact.value)

  const Icon = KIND_ICON[fact.kind]

  const startEdit = (): void => {
    setKind(fact.kind)
    setValue(fact.value)
    setEditing(true)
    setConfirming(false)
  }

  const submit = async (event?: FormEvent): Promise<void> => {
    event?.preventDefault()
    if (saving) return
    const saved = await onSave(fact.id, { kind, value })
    if (saved) setEditing(false)
  }

  return (
    <li className={styles.fact}>
      {editing ? (
        <form className={styles.editForm} onSubmit={submit}>
          <div className={styles.editRow}>
            <label className={styles.editKind}>
              <span className="sr-only">Тип факта</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as MemoryFactKind)}
                disabled={saving}
              >
                {KINDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <input
              className={styles.editValue}
              value={value}
              onChange={(event) => setValue(event.target.value.slice(0, MAX_VALUE))}
              maxLength={MAX_VALUE}
              autoFocus
              required
              disabled={saving}
            />
          </div>

          <div className={styles.editActions}>
            <button type="submit" className={styles.save} disabled={saving || !value.trim()}>
              {saving ? (
                <Loader2 className={styles.spin} size={14} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Check size={14} strokeWidth={2.4} aria-hidden="true" />
              )}
              Сохранить
            </button>
            <button
              type="button"
              className={styles.ghost}
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X size={14} strokeWidth={2} aria-hidden="true" />
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <>
          <span className={styles.factIcon} aria-hidden="true">
            <Icon size={15} strokeWidth={1.9} />
          </span>

          <div className={styles.factBody}>
            <span className={styles.factKind}>{KIND_LABEL[fact.kind]}</span>
            <p className={styles.factValue}>{fact.value}</p>
          </div>

          <div className={styles.factActions}>
            {confirming ? (
              <>
                <button
                  type="button"
                  className={styles.confirmDelete}
                  onClick={() => void onDelete(fact.id)}
                  disabled={saving}
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
              <>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={startEdit}
                  disabled={saving}
                  aria-label={`Изменить факт: ${fact.value}`}
                  title="Изменить"
                >
                  <Pencil size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setConfirming(true)}
                  disabled={saving}
                  aria-label={`Удалить факт: ${fact.value}`}
                  title="Удалить"
                >
                  <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}

export function MemoryPage() {
  const {
    facts,
    updatedAt,
    loading,
    saving,
    offline,
    error,
    refresh,
    addFact,
    updateFact,
    removeFact,
    clearAll,
    clearError,
  } = useMemory()

  const [kind, setKind] = useState<MemoryFactKind>('name')
  const [value, setValue] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [exported, setExported] = useState(false)

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!value.trim() || saving) return
    const saved = await addFact(kind, value)
    if (saved) setValue('')
  }

  const forgetAll = async (): Promise<void> => {
    await clearAll()
    setConfirmClear(false)
  }

  const exportFacts = (): void => {
    const payload = {
      app: 'Золотая рыбка',
      exportedAt: new Date().toISOString(),
      updatedAt,
      facts,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `zolotaya-rybka-memory-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)

    setExported(true)
    window.setTimeout(() => setExported(false), 2600)
  }

  return (
    <section className={styles.page} aria-labelledby="memory-title">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>волна помнит берег</p>
        <h1 id="memory-title" className={styles.title}>
          Память
        </h1>
        <p className={styles.lead}>
          Рыбка запоминает имя, цели, привычки и важные даты — и учитывает их в каждом
          ответе. Факты можно править и удалить в любой момент. Без регистрации.
        </p>
        <ul className={styles.chips}>
          <li>автозапоминание из чата</li>
          <li>экспорт JSON</li>
          <li>удаление одной кнопкой</li>
        </ul>
      </header>

      <div className={styles.grid}>
        <GlassCard className={styles.createCard}>
          <div className={styles.cardHead}>
            <div>
              <h2 className={styles.cardTitle}>Добавить факт</h2>
              <p className={styles.cardHint}>
                Коротко и по делу: «зовут Иван», «цель — запустить проект».
              </p>
            </div>
            {offline && <span className={styles.offlineBadge}>локально</span>}
          </div>

          <form className={styles.form} onSubmit={submit}>
            <fieldset className={styles.kindGroup}>
              <legend className={styles.label}>Тип</legend>
              <div className={styles.kindChips}>
                {KINDS.map((item) => {
                  const Icon = item.icon
                  const active = kind === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={[styles.kindChip, active && styles.kindChipActive]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setKind(item.id)}
                      aria-pressed={active}
                    >
                      <Icon size={13} strokeWidth={1.9} aria-hidden="true" />
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </fieldset>

            <label className={styles.field} htmlFor="memory-value">
              <span className={styles.label}>Факт</span>
              <textarea
                id="memory-value"
                className={styles.textarea}
                value={value}
                onChange={(event) => setValue(event.target.value.slice(0, MAX_VALUE))}
                maxLength={MAX_VALUE}
                rows={3}
                placeholder={
                  kind === 'name'
                    ? 'Например: Ивана зовут Иван'
                    : kind === 'goal'
                      ? 'Например: запустить свой проект до лета'
                      : kind === 'habit'
                        ? 'Например: бегает по утрам по вторникам'
                        : kind === 'date'
                          ? 'Например: день рождения 12 июня'
                          : 'Например: не любит созвоны до 11 утра'
                }
                required
              />
            </label>

            <button type="submit" className={styles.submit} disabled={!value.trim() || saving}>
              {saving ? (
                <Loader2 className={styles.spin} size={16} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
              )}
              {saving ? 'Сохраняю…' : 'Запомнить'}
            </button>
          </form>

          <div className={styles.tools}>
            <button
              type="button"
              className={styles.tool}
              onClick={exportFacts}
              disabled={facts.length === 0}
            >
              <Download size={14} strokeWidth={2} aria-hidden="true" />
              {exported ? 'Файл сохранён' : 'Экспорт JSON'}
            </button>

            {confirmClear ? (
              <span className={styles.confirmClear}>
                <button
                  type="button"
                  className={styles.danger}
                  onClick={() => void forgetAll()}
                  disabled={saving}
                >
                  Точно всё удалить
                </button>
                <button
                  type="button"
                  className={styles.tool}
                  onClick={() => setConfirmClear(false)}
                >
                  Отмена
                </button>
              </span>
            ) : (
              <button
                type="button"
                className={styles.tool}
                onClick={() => setConfirmClear(true)}
                disabled={facts.length === 0 || saving}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
                Забыть всё
              </button>
            )}
          </div>

          <p className={styles.privacy}>
            {offline
              ? 'Сервер недоступен: факты хранятся в этом браузере и не потеряются.'
              : 'После входа те же факты откроются на других устройствах.'}
          </p>
        </GlassCard>

        <div className={styles.listArea}>
          <div className={styles.listHead}>
            <div>
              <h2 className={styles.listTitle}>
                {facts.length > 0 ? 'Что рыбка помнит' : 'Память пока пуста'}
              </h2>
              <p className={styles.listMeta}>
                {facts.length > 0
                  ? `${facts.length} факт(ов) · обновлено ${formatDate(updatedAt)}`
                  : 'Добавь первый факт или просто расскажи о себе в чате'}
              </p>
            </div>

            <button
              type="button"
              className={styles.refresh}
              onClick={() => void refresh()}
              disabled={loading}
              aria-label="Обновить память"
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

          {error && (
            <div className={styles.errorBar} role="alert">
              <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
              <span>{error}</span>
              <button type="button" onClick={clearError}>
                Закрыть
              </button>
            </div>
          )}

          {loading && facts.length === 0 ? (
            <GlassCard className={styles.stateCard}>
              <Loader2 className={styles.spin} size={18} strokeWidth={2} aria-hidden="true" />
              <p>Собираю воспоминания со дна…</p>
            </GlassCard>
          ) : facts.length === 0 ? (
            <GlassCard className={styles.stateCard}>
              <span className={styles.stateIcon} aria-hidden="true">
                <Sparkles size={18} strokeWidth={1.8} />
              </span>
              <p className={styles.stateTitle}>Рыбка ещё ничего не знает</p>
              <p className={styles.stateText}>
                Скажи в чате «Меня зовут …» или «Я хочу …» — факт появится здесь
                автоматически.
              </p>
            </GlassCard>
          ) : (
            <ul className={styles.facts}>
              {facts.map((fact) => (
                <FactRow
                  key={fact.id}
                  fact={fact}
                  saving={saving}
                  onSave={updateFact}
                  onDelete={removeFact}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}
