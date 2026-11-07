/**
 * Дневник Идей (Project Vault) — выезжающая панель справа.
 *
 * Стиль Apple: тёмное матовое стекло (#0A0E17/90 + backdrop-blur-xl),
 * ноль визуального шума, серифный заголовок «Мои Идеи» как на главном экране.
 * Карточка → клик → модалка с полным текстом и «Скопировать».
 * Внизу — аккуратная красная «Очистить Дневник» с подтверждением.
 */

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, Check, Copy, FileCode2, Trash2, X } from 'lucide-react'
import { copyToClipboard, entryToText, formatVaultDate, type VaultEntry } from '../../idea/vault'

interface ProjectVaultProps {
  open: boolean
  entries: VaultEntry[]
  onRemove: (id: string) => void
  onClear: () => void
  onClose: () => void
}

const EASE = [0.22, 0.61, 0.36, 1] as const

/** Премиальная кнопка: стекло + золотое свечение при наведении. */
const GOLD_BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-white/12 ' +
  'bg-white/[0.05] px-3.5 py-1.5 text-[12px] text-white/70 cursor-pointer ' +
  'transition-all duration-200 hover:border-[rgba(249,207,107,0.5)] hover:text-[#ffe55c] ' +
  'hover:shadow-[0_0_22px_rgba(249,207,107,0.28)] active:scale-[0.97] disabled:opacity-50'

export function ProjectVault({ open, entries, onRemove, onClear, onClose }: ProjectVaultProps) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const active = entries.find((entry) => entry.id === openId) ?? null

  /* Esc закрывает модалку, затем панель. */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (openId !== null) setOpenId(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openId, onClose])

  /* Сброс локального состояния при закрытии панели. */
  useEffect(() => {
    if (!open) {
      setOpenId(null)
      setConfirmClear(false)
    }
  }, [open])

  const handleCopy = useCallback(async (entry: VaultEntry, key: string) => {
    const ok = await copyToClipboard(entryToText(entry))
    if (!ok) return
    setCopiedId(key)
    window.setTimeout(() => setCopiedId((prev) => (prev === key ? null : prev)), 1800)
  }, [])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Скрим: клик мимо панели закрывает её */}
          <motion.div
            className="fixed inset-0 z-[60] bg-[rgba(5,8,15,0.45)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={() => {
              if (openId !== null) setOpenId(null)
              else onClose()
            }}
            aria-hidden="true"
          />

          {/* Панель: тёмное стекло, выезд справа */}
          <motion.aside
            className="fixed top-0 right-0 bottom-0 z-[61] flex w-[350px] max-w-[92vw] flex-col border-l border-white/10 bg-[#0A0E17]/90 backdrop-blur-xl"
            style={{ WebkitBackdropFilter: 'blur(24px)' }}
            role="dialog"
            aria-label="Дневник идей"
            initial={{ x: 360, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0.6 }}
            transition={{ duration: 0.36, ease: EASE }}
          >
            {/* ── Шапка ── */}
            <header className="flex items-start justify-between gap-2.5 px-5 pt-5 pb-3">
              <div className="flex items-start gap-2.5">
                <Archive size={17} strokeWidth={1.7} className="mt-1 text-[#ffd700]" aria-hidden="true" />
                <div>
                  <h2
                    className="m-0 text-[17px] leading-tight text-white"
                    style={{ fontFamily: 'var(--font-display)' }}
                  >
                    Мои Идеи
                  </h2>
                  <p className="mt-1 text-[11.5px] text-white/45">
                    {entries.length === 0
                      ? 'сохранённые планы и код'
                      : `${entries.length} ${entries.length === 1 ? 'запись' : entries.length < 5 ? 'записи' : 'записей'} · под рукой`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 text-white/55 transition-colors duration-200 hover:border-[rgba(249,207,107,0.5)] hover:text-white"
                onClick={onClose}
                aria-label="Закрыть дневник"
              >
                <X size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </header>

            {/* ── Список карточек ── */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
              {entries.length === 0 ? (
                <motion.div
                  className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.08, ease: EASE }}
                >
                  <Archive size={30} strokeWidth={1.2} className="text-white/20" aria-hidden="true" />
                  <p className="m-0 text-[13px] leading-relaxed text-white/40">
                    Дневник пуст.
                    <br />
                    Сохраняй планы и код Рыбки кнопкой «Сохранить в Дневник» — они будут ждать здесь.
                  </p>
                </motion.div>
              ) : (
                entries.map((entry, index) => {
                  const copied = copiedId === entry.id
                  return (
                    <motion.button
                      key={entry.id}
                      type="button"
                      className="group w-full cursor-pointer rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 text-left transition-all duration-200 hover:border-[rgba(249,207,107,0.4)] hover:bg-white/[0.06] hover:shadow-[0_0_26px_rgba(249,207,107,0.14)]"
                      initial={{ opacity: 0, x: 18 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: 0.04 * Math.min(index, 8), ease: EASE }}
                      onClick={() => setOpenId(entry.id)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="min-w-0 flex-1 truncate text-[13.5px] text-white/90"
                          style={{ fontFamily: 'var(--font-display)' }}
                          title={entry.title}
                        >
                          {entry.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-white/35">
                          {formatVaultDate(entry.date)}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <FileCode2 size={12} strokeWidth={1.7} className="text-white/30" aria-hidden="true" />
                        <span className="truncate font-mono text-[11px] text-white/45" title={entry.fileName}>
                          {entry.fileName}
                        </span>
                      </div>
                      {entry.plan.trim().length > 0 && (
                        <p className="mt-1.5 mb-0 line-clamp-2 text-[11.5px] leading-snug text-white/35">
                          {entry.plan.trim()}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2.5">
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-[#ffd700]/70 transition-colors duration-200 hover:text-[#ffe55c]"
                          onClick={(event) => {
                            event.stopPropagation()
                            void handleCopy(entry, entry.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.stopPropagation()
                              void handleCopy(entry, entry.id)
                            }
                          }}
                        >
                          {copied ? <Check size={12} strokeWidth={2.4} aria-hidden="true" /> : <Copy size={12} strokeWidth={1.8} aria-hidden="true" />}
                          {copied ? 'Скопировано' : 'Скопировать задачу'}
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/30 transition-colors duration-200 hover:text-[#ff917c]"
                          onClick={(event) => {
                            event.stopPropagation()
                            onRemove(entry.id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.stopPropagation()
                              onRemove(entry.id)
                            }
                          }}
                          aria-label={`Удалить «${entry.title}» из дневника`}
                        >
                          <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" />
                        </span>
                      </div>
                    </motion.button>
                  )
                })
              )}
            </div>

            {/* ── Подвал: очистка ── */}
            <footer className="border-t border-white/[0.07] px-4 pt-3 pb-[calc(14px+var(--safe-bottom))]">
              {confirmClear ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-white/60">Точно очистить всё?</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="cursor-pointer rounded-full border border-[rgba(255,145,124,0.45)] bg-[rgba(255,107,87,0.12)] px-3 py-1.5 text-[11.5px] text-[#ffb3a3] transition-all duration-200 hover:shadow-[0_0_18px_rgba(255,107,87,0.25)] active:scale-[0.97]"
                      onClick={() => {
                        onClear()
                        setConfirmClear(false)
                      }}
                    >
                      Да, очистить
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] text-white/55 transition-colors duration-200 hover:text-white active:scale-[0.97]"
                      onClick={() => setConfirmClear(false)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mx-auto flex cursor-pointer items-center gap-1.5 rounded-full border border-[rgba(255,145,124,0.28)] bg-transparent px-4 py-1.5 text-[11.5px] text-[#ff917c]/80 transition-all duration-200 hover:border-[rgba(255,145,124,0.55)] hover:bg-[rgba(255,107,87,0.08)] hover:text-[#ffb3a3] hover:shadow-[0_0_18px_rgba(255,107,87,0.18)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40"
                  onClick={() => setConfirmClear(true)}
                  disabled={entries.length === 0}
                >
                  <Trash2 size={12} strokeWidth={1.8} aria-hidden="true" />
                  Очистить Дневник
                </button>
              )}
            </footer>
          </motion.aside>

          {/* ── Модалка с полным текстом задачи ── */}
          <AnimatePresence>
            {active !== null && (
              <motion.div
                className="fixed inset-0 z-[70] grid place-items-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                onClick={() => setOpenId(null)}
              >
                <div className="absolute inset-0 bg-[rgba(3,5,10,0.7)] backdrop-blur-sm" aria-hidden="true" />
                <motion.div
                  className="relative flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[26px] border border-white/12 bg-[#0A0E17]/95 shadow-[0_40px_120px_-40px_rgba(0,0,0,1)] backdrop-blur-2xl"
                  role="dialog"
                  aria-label={active.title}
                  initial={{ scale: 0.94, y: 18, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.94, y: 18, opacity: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <header className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-5 pt-5 pb-4">
                    <div className="min-w-0">
                      <h3
                        className="m-0 text-[17px] leading-snug text-white"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {active.title}
                      </h3>
                      <p className="mt-1 mb-0 flex items-center gap-1.5 text-[11px] text-white/40">
                        <FileCode2 size={11} strokeWidth={1.7} aria-hidden="true" />
                        {active.fileName} · {formatVaultDate(active.date)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-white/12 text-white/55 transition-colors duration-200 hover:border-[rgba(249,207,107,0.5)] hover:text-white"
                      onClick={() => setOpenId(null)}
                      aria-label="Закрыть"
                    >
                      <X size={15} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </header>

                  <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
                    {active.plan.trim().length > 0 && (
                      <>
                        <p className="m-0 mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/35 uppercase">
                          План
                        </p>
                        <p className="m-0 mb-4 text-[13px] leading-relaxed whitespace-pre-wrap text-white/75">
                          {active.plan.trim()}
                        </p>
                      </>
                    )}
                    <p className="m-0 mb-2 text-[10px] font-semibold tracking-[0.12em] text-white/35 uppercase">
                      Код
                    </p>
                    <pre className="m-0 overflow-x-auto rounded-xl border border-white/[0.07] bg-[rgba(255,255,255,0.03)] p-3.5 font-mono text-[11.5px] leading-relaxed text-[#e9f3ff]">
                      {active.code.trim().length > 0 ? active.code : '// код не сохранён'}
                    </pre>
                  </div>

                  <footer className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 pt-3.5 pb-4">
                    <button
                      type="button"
                      className={GOLD_BTN}
                      onClick={() => void handleCopy(active, 'modal')}
                    >
                      {copiedId === 'modal' ? (
                        <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                      ) : (
                        <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
                      )}
                      {copiedId === 'modal' ? 'Скопировано' : 'Скопировать'}
                    </button>
                  </footer>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}
