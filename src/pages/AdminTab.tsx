/**
 * Админка — панель управления Колобком (экран-заглушка).
 *
 * Доступ только для админа (useTGConnect.isAdmin): остальным —
 * аккуратная заглушка. Промт и список пользователей пока моковые —
 * контракты бэкенда подключим следующим шагом.
 */

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { RefreshCw, Shield, Users } from 'lucide-react'
import { useTGConnect } from '../hooks/useTGConnect'

const EASE = [0.22, 0.61, 0.36, 1] as const

const MOCK_USERS: ReadonlyArray<{
  id: number
  name: string
  username: string
  role: 'admin' | 'user'
  joinedAt: string
}> = [
  { id: 111111111, name: 'Владелец', username: '@owner', role: 'admin', joinedAt: '01.09.2025' },
  { id: 220011445, name: 'Анна', username: '@anna_builds', role: 'user', joinedAt: '14.10.2025' },
  { id: 330022556, name: 'Дмитрий', username: '@dima_dev', role: 'user', joinedAt: '02.11.2025' },
  { id: 440033667, name: 'Мария', username: '@mira_writes', role: 'user', joinedAt: '21.11.2025' },
]

export function AdminTab() {
  const { isAdmin } = useTGConnect()
  const [promptBusy, setPromptBusy] = useState(false)
  const [promptUpdated, setPromptUpdated] = useState(false)

  const refreshPrompt = useCallback(() => {
    if (promptBusy) return
    setPromptBusy(true)
    setPromptUpdated(false)
    // Мок: здесь будет POST /api/admin/system-prompt.
    window.setTimeout(() => {
      setPromptBusy(false)
      setPromptUpdated(true)
    }, 900)
  }, [promptBusy])

  if (!isAdmin) {
    return (
      <div className="grid h-full place-items-center px-6">
        <motion.div
          className="max-w-[340px] rounded-[26px] border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          <Shield size={30} strokeWidth={1.3} className="mx-auto text-white/25" aria-hidden="true" />
          <p className="mt-3 mb-0 text-[13.5px] leading-relaxed text-white/50">
            Панель управления доступна только администратору. Войди через Telegram с аккаунта владельца.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[680px] flex-col gap-5 overflow-y-auto px-1 pb-2 [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
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
          Панель управления <span className="italic text-[#ffd700]">Колобком</span>
        </h1>
        <p className="mt-1.5 mb-0 flex items-center justify-center gap-1.5 text-[12.5px] text-white/45">
          <Shield size={13} strokeWidth={1.8} className="text-[#ffd700]" aria-hidden="true" />
          Режим администратора
        </p>
      </motion.header>

      {/* ── Системный промт ── */}
      <motion.section
        className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.06, ease: EASE }}
      >
        <h2
          className="m-0 text-[15px] text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Системный промт
        </h2>
        <p className="mt-1.5 mb-4 text-[12px] leading-relaxed text-white/45">
          Характер Рыбки и Колобка живёт на сервере. После обновления промт
          применится к новым диалогам без перезапуска.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[rgba(249,207,107,0.45)] bg-[rgba(249,207,107,0.1)] px-4 py-2 text-[12px] text-[#ffe55c] transition-all duration-200 hover:shadow-[0_0_24px_rgba(249,207,107,0.3)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
            onClick={refreshPrompt}
            disabled={promptBusy}
          >
            <RefreshCw
              size={13}
              strokeWidth={2}
              className={promptBusy ? 'animate-spin' : undefined}
              aria-hidden="true"
            />
            Обновить системный промт
          </button>
          {promptUpdated && (
            <motion.span
              className="text-[12px] text-[#7dffff]"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
            >
              Промт обновлён ✓
            </motion.span>
          )}
        </div>
      </motion.section>

      {/* ── Пользователи (мок) ── */}
      <motion.section
        className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, delay: 0.12, ease: EASE }}
      >
        <h2
          className="m-0 mb-3 flex items-center gap-2 text-[15px] text-white"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          <Users size={15} strokeWidth={1.8} className="text-[#ffd700]" aria-hidden="true" />
          Пользователи
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {MOCK_USERS.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3 transition-colors duration-200 hover:bg-white/[0.05]"
            >
              <div className="min-w-0">
                <p className="m-0 text-[13px] text-white">
                  {user.name} <span className="text-white/35">{user.username}</span>
                </p>
                <p className="m-0 mt-0.5 font-mono text-[10.5px] text-white/30">
                  id {user.id} · с {user.joinedAt}
                </p>
              </div>
              <span
                className={[
                  'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide',
                  user.role === 'admin'
                    ? 'border-[rgba(249,207,107,0.45)] bg-[rgba(249,207,107,0.1)] text-[#ffe55c]'
                    : 'border-white/12 bg-white/[0.04] text-white/50',
                ].join(' ')}
              >
                {user.role === 'admin' ? 'админ' : 'пользователь'}
              </span>
            </li>
          ))}
        </ul>
      </motion.section>
    </div>
  )
}
