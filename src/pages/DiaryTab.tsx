/**
 * Дневник Визионера — премиальный личный дневник в стиле Apple.
 *
 * Строка ввода как поиск в Safari, пилюля «Итоги дня (Стив Джобс)»
 * разворачивает три элегантных поля, карточки записей — как в Apple Wallet
 * (тёмное стекло, крупная дата, аккуратный текст), ответ Рыбки — с аватаркой
 * 🐠 в углу. Идею можно одним кликом перенести в Чат и продолжить вайбкодинг.
 *
 * Дневник персональный, но стена на входе убрана: гость видит обычный
 * интерфейс и может писать, а при попытке сохранить запись всплывает
 * элегантная модалка LoginModal — приглашение, а не блокировка.
 */

import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, Rocket, Trash2 } from 'lucide-react'
import { useDiary, type DiaryEntry } from '../hooks/useDiary'
import { useTGConnect } from '../hooks/useTGConnect'
import { LoginModal } from '../components/auth/LoginModal'

interface DiaryTabProps {
  /** Перенести идею в Чат: текст уедет в поле ввода IdeaWorkspace. */
  onIdeaToChat: (text: string) => void
}

const EASE = [0.22, 0.61, 0.36, 1] as const

const JOBS_QUESTIONS: ReadonlyArray<string> = [
  'Что я сделал сегодня, чтобы изменить мир?',
  'Чему я научился?',
  'Что я мог бы сделать лучше?',
]

const dateFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' })

function splitEntryDate(iso: string): { date: string; time: string } {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return { date: 'недавно', time: '' }
  return { date: dateFmt.format(parsed), time: timeFmt.format(parsed) }
}

/** Полный текст идеи для переноса в Чат. */
function ideaText(entry: DiaryEntry): string {
  const parts = [entry.text.trim()]
  if (entry.reply.trim().length > 0) {
    parts.push('', `Рыбка советовала: ${entry.reply.trim()}`)
  }
  return parts.join('\n')
}

export function DiaryTab({ onIdeaToChat }: DiaryTabProps) {
  const { user, isAuthenticated } = useTGConnect()
  const { entries, busy, error, addEntry, deleteEntry } = useDiary()

  const [loginOpen, setLoginOpen] = useState(false)
  const [input, setInput] = useState('')
  const [jobsMode, setJobsMode] = useState(false)
  const [jobs, setJobs] = useState<string[]>(['', '', ''])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  /* ── Пилюля Джобса: плавно разворачивает три поля ── */

  const toggleJobs = useCallback(() => {
    setJobsMode((prev) => {
      const next = !prev
      if (next) setJobs(['', '', ''])
      return next
    })
  }, [])

  const setJobAnswer = useCallback((index: number, value: string): void => {
    setJobs((prev) => prev.map((answer, i) => (i === index ? value : answer)))
  }, [])

  /* ── Сохранение записи ── */

  const openLogin = useCallback((): void => setLoginOpen(true), [])
  const closeLogin = useCallback((): void => setLoginOpen(false), [])

  const handleSave = useCallback(
    async (event?: React.FormEvent) => {
      event?.preventDefault()
      if (busy) return

      // Гостю даём всё потрогать, но сохранение — только после входа.
      if (!isAuthenticated) {
        setLoginOpen(true)
        return
      }

      let text = ''
      if (jobsMode) {
        const answers = jobs
          .map((answer, index) =>
            answer.trim().length > 0
              ? `${index + 1}. ${answer.trim()}`
              : `${index + 1}. ${JOBS_QUESTIONS[index]} — (без ответа)`,
          )
          .join('\n')
        text = answers
      } else {
        text = input.trim()
      }
      if (text.length === 0) return

      setInput('')
      setJobs(['', '', ''])
      setJobsMode(false)
      await addEntry(text)
    },
    [addEntry, busy, input, jobs, jobsMode, isAuthenticated],
  )

  const greeting = user?.first_name ? `${user.first_name}, ` : ''

  return (
    <div className="mx-auto flex h-full w-full max-w-[680px] flex-col gap-4 px-1">
      {/* ── Шапка ── */}
      <motion.header
        className="pt-2 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <h1
          className="m-0 text-[clamp(26px,5vw,36px)] leading-tight text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Дневник <span className="italic text-[#ffd700]">Визионера</span>
        </h1>
        <p className="mt-1.5 text-[12.5px] text-white/45">
          {greeting}мысли и идеи — Рыбка читает и подсказывает следующий шаг
        </p>

        {/* Аватарка и имя из Telegram — или приглашение для гостя */}
        {user !== null ? (
          <motion.div
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] py-1 pr-4 pl-1 backdrop-blur-xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
          >
            {user.photo_url ? (
              <img
                className="size-7 rounded-full border border-[rgba(249,207,107,0.45)] object-cover"
                src={user.photo_url}
                alt=""
              />
            ) : (
              <span
                className="grid size-7 place-items-center rounded-full border border-[rgba(249,207,107,0.45)] bg-gradient-to-b from-[#ffe55c] to-[#eac300] text-[12px] font-semibold text-[#0a0e17]"
                aria-hidden="true"
              >
                {(user.first_name ?? '?').trim().charAt(0).toUpperCase() || '?'}
              </span>
            )}
            <span className="text-[12px] text-white/85">
              {user.first_name}
              {user.last_name ? ` ${user.last_name}` : ''}
            </span>
          </motion.div>
        ) : (
          <motion.button
            type="button"
            className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(249,207,107,0.35)] bg-[rgba(249,207,107,0.06)] py-1.5 pr-4 pl-1.5 text-[12px] text-[#ffe55c]/90 backdrop-blur-xl transition-all duration-200 hover:border-[rgba(249,207,107,0.6)] hover:text-[#ffe55c] hover:shadow-[0_0_26px_rgba(249,207,107,0.28)] active:scale-[0.97]"
            onClick={openLogin}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15, ease: EASE }}
          >
            <span className="grid size-6 place-items-center rounded-full border border-[rgba(249,207,107,0.45)] bg-[rgba(249,207,107,0.12)] text-[11px]" aria-hidden="true">
              🐠
            </span>
            Войти через Telegram
          </motion.button>
        )}
      </motion.header>

      {/* ── Лента записей (карточки Apple Wallet) ── */}
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto pb-1 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
        {entries.length === 0 ? (
          <motion.div
            className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[24px] border border-white/10 bg-white/5 px-8 py-10 text-center backdrop-blur-xl"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
          >
            <span className="text-[34px]" aria-hidden="true">
              📖
            </span>
            <p className="m-0 text-[13px] leading-relaxed text-white/45">
              Пока ни одной записи. Напишите мысль — или подведите итоги дня
              в стиле Стива Джобса.
            </p>
          </motion.div>
        ) : (
          entries.map((entry, index) => {
            const { date, time } = splitEntryDate(entry.createdAt)
            return (
              <motion.article
                key={entry.id}
                className="relative overflow-hidden rounded-[24px] border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-5 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-shadow duration-200 hover:shadow-[0_0_40px_rgba(249,207,107,0.12)]"
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.42, delay: 0.04 * Math.min(index, 6), ease: EASE }}
              >
                {/* Крупная дата — как на карте Wallet */}
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[17px] text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    {date}
                  </span>
                  <span className="text-[11px] tabular-nums text-white/35">{time}</span>
                  <button
                    type="button"
                    className="ml-auto grid size-7 cursor-pointer place-items-center rounded-full text-white/20 transition-colors duration-200 hover:text-[#ff917c]"
                    onClick={() => deleteEntry(entry.id)}
                    aria-label="Удалить запись"
                  >
                    <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>

                {/* Текст пользователя — чистый и аккуратный */}
                <p className="m-0 mt-2 text-[13.5px] leading-relaxed whitespace-pre-wrap text-white/95">
                  {entry.text}
                </p>

                {/* Ответ Рыбки: аватарка 🐠 в углу карточки */}
                <div className="mt-3.5 rounded-2xl border border-[rgba(249,207,107,0.22)] bg-[rgba(249,207,107,0.06)] p-3.5 pr-3.5 pl-14">
                  <span
                    className="absolute mt-0.5 grid size-9 place-items-center rounded-full border border-[rgba(249,207,107,0.35)] bg-[rgba(249,207,107,0.12)] text-[16px] shadow-[0_0_16px_rgba(249,207,107,0.2)]"
                    style={{ marginLeft: '-44px' }}
                    aria-hidden="true"
                  >
                    🐠
                  </span>
                  {entry.status === 'pending' ? (
                    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#7dffff]/80">
                      Рыбка читает запись
                      <span className="inline-flex gap-1" aria-hidden="true">
                        <i className="size-1 animate-bounce rounded-full bg-[#7dffff]" />
                        <i className="size-1 animate-bounce rounded-full bg-[#7dffff] [animation-delay:150ms]" />
                        <i className="size-1 animate-bounce rounded-full bg-[#7dffff] [animation-delay:300ms]" />
                      </span>
                    </span>
                  ) : (
                    <p
                      className={[
                        'm-0 text-[12.5px] leading-relaxed whitespace-pre-wrap',
                        entry.status === 'error' ? 'text-[#ffb3a3]' : 'text-[#ffe55c]',
                      ].join(' ')}
                    >
                      {entry.reply}
                    </p>
                  )}
                </div>

                {/* Перенос идеи в Чат */}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(0,255,255,0.28)] bg-[rgba(0,255,255,0.06)] px-3.5 py-1.5 text-[11.5px] text-[#7dffff] transition-all duration-200 hover:border-[rgba(0,255,255,0.55)] hover:bg-[rgba(0,255,255,0.1)] hover:shadow-[0_0_20px_rgba(0,255,255,0.18)] active:scale-[0.97]"
                    onClick={() => onIdeaToChat(ideaText(entry))}
                  >
                    <Rocket size={12} strokeWidth={1.9} aria-hidden="true" />
                    Внедрить идею в Чат
                  </button>
                </div>
              </motion.article>
            )
          })
        )}
      </div>

      {/* ── Низ: пилюля Джобса + строка ввода как в Safari ── */}
      <motion.div
        className="flex flex-col gap-2.5 pb-1"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.12, ease: EASE }}
      >
        {error !== null && (
          <p className="m-0 text-center text-[11.5px] text-[#ffb3a3]">{error}</p>
        )}

        {/* Гостю — мягкая подсказка вместо стены: пишите свободно, вход по требованию */}
        {!isAuthenticated && (
          <motion.p
            className="m-0 text-center text-[11.5px] text-white/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25, ease: EASE }}
          >
            Войдите, чтобы сохранить эту запись
          </motion.p>
        )}

        <button
          type="button"
          className={[
            'mx-auto inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[12px] transition-all duration-200 active:scale-[0.97]',
            jobsMode
              ? 'border border-[rgba(249,207,107,0.6)] bg-[rgba(249,207,107,0.14)] text-[#ffe55c] shadow-[0_0_30px_rgba(249,207,107,0.32)]'
              : 'border border-[rgba(249,207,107,0.35)] bg-[rgba(249,207,107,0.06)] text-[#ffe55c]/90 hover:border-[rgba(249,207,107,0.6)] hover:text-[#ffe55c] hover:shadow-[0_0_26px_rgba(249,207,107,0.28)]',
          ].join(' ')}
          onClick={toggleJobs}
          aria-pressed={jobsMode}
          aria-expanded={jobsMode}
        >
          <span aria-hidden="true">{jobsMode ? '✨' : '🌙'}</span>
          Итоги дня (Стив Джобс)
        </button>

        {/* Три вопроса — плавное разворачивание */}
        <AnimatePresence initial={false}>
          {jobsMode && (
            <motion.div
              key="jobs"
              className="overflow-hidden"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.34, ease: EASE }}
            >
              <div className="flex flex-col gap-2 rounded-[22px] border border-[rgba(249,207,107,0.25)] bg-white/[0.04] p-3 backdrop-blur-xl">
                {JOBS_QUESTIONS.map((question, index) => (
                  <label key={question} className="flex items-center gap-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-[rgba(249,207,107,0.4)] text-[11px] text-[#ffe55c]">
                      {index + 1}
                    </span>
                    <input
                      className="w-full rounded-xl border-none bg-transparent px-2 py-1.5 text-[13px] text-white outline-none placeholder:text-white/30"
                      value={jobs[index] ?? ''}
                      onChange={(event) => setJobAnswer(index, event.target.value)}
                      placeholder={question}
                      aria-label={question}
                    />
                  </label>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Строка ввода — элегантное стекло, без тяжёлой рамки */}
        <form
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1.5 pr-1.5 pl-5 backdrop-blur-xl transition-colors duration-200 focus-within:border-white/20"
          onSubmit={(event) => void handleSave(event)}
        >
          <textarea
            ref={inputRef}
            className="max-h-28 flex-1 resize-none bg-transparent py-1.5 text-[13.5px] leading-relaxed text-white outline-none placeholder:text-white/30 [scrollbar-width:thin]"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void handleSave()
              }
            }}
            placeholder={jobsMode ? 'Ответы выше — или свободная мысль…' : 'Что сегодня пришло в голову?'}
            rows={1}
            aria-hidden={jobsMode}
            aria-label="Новая запись в дневник"
          />
          <button
            type="submit"
            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full border border-[rgba(249,207,107,0.5)] bg-[rgba(249,207,107,0.14)] text-[#ffe55c] transition-all duration-200 hover:shadow-[0_0_24px_rgba(249,207,107,0.35)] active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35"
            disabled={
              busy ||
              (jobsMode
                ? jobs.every((answer) => answer.trim().length === 0)
                : input.trim().length === 0)
            }
            aria-label="Сохранить запись"
          >
            <ArrowUp size={16} strokeWidth={2.2} aria-hidden="true" />
          </button>
        </form>
      </motion.div>

      {/* Контекстная авторизация: стеклянная модалка поверх живого интерфейса */}
      <LoginModal open={loginOpen} onClose={closeLogin} />
    </div>
  )
}
