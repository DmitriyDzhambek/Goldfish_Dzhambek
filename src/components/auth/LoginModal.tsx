/**
 * LoginModal — элегантное приглашение к входу, а не блокировка.
 *
 * Стеклянная карточка по центру (Glassmorphism) поверх затемнённого,
 * но живого интерфейса: приложение и нижнее меню проглядывают сквозь
 * затемнение. Внутри — официальный Telegram Login Widget: невидимый
 * iframe-слой лежит ровно поверх нашей золотой кнопки и ловит реальные
 * клики, открывая нативное всплывающее окно авторизации Telegram.
 *
 * После успешного входа виджет вызывает `window.onTelegramAuth(user)`
 * (регистрируется в useTGConnect) — данные сохраняются в localStorage,
 * и модалка плавно растворяется через Framer Motion.
 */

import { useCallback, useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Send } from 'lucide-react'
import { TELEGRAM_BOT_NAME, useTGConnect } from '../../hooks/useTGConnect'

const EASE = [0.22, 0.61, 0.36, 1] as const

interface LoginModalProps {
  /** Модалка открыта. */
  open: boolean
  /** Закрыть без входа («Продолжить как гость», клик по фону, Escape). */
  onClose: () => void
}

export function LoginModal({ open, onClose }: LoginModalProps) {
  const widgetRef = useRef<HTMLDivElement>(null)
  const { isAuthenticated } = useTGConnect()

  /* Вход выполнен — модалка уходит сама, данные уже в localStorage. */
  useEffect(() => {
    if (open && isAuthenticated) onClose()
  }, [open, isAuthenticated, onClose])

  /* Монтируем официальный виджет в невидимый слой поверх нашей кнопки. */
  useEffect(() => {
    const container = widgetRef.current
    if (!container || !open) return

    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.async = true
    script.setAttribute('data-telegram-login', TELEGRAM_BOT_NAME)
    script.setAttribute('data-size', 'large')
    script.setAttribute('data-onauth', 'onTelegramAuth(user)')
    script.setAttribute('data-request-access', 'write')
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [open])

  /* Escape закрывает модалку — гость продолжает пользоваться Чатом. */
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  /* Блокируем прокрутку фона, пока модалка открыта. */
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  const handleClose = useCallback((): void => onClose(), [onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="login-overlay"
          className="fixed inset-0 z-[80] grid place-items-center bg-black/60 px-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          onClick={handleClose}
          role="presentation"
        >
          <motion.div
            className="relative w-full max-w-[380px] overflow-hidden rounded-[30px] border border-white/10 bg-[#0A0E17]/80 p-9 text-center shadow-[0_40px_120px_-40px_rgba(0,0,0,1)] backdrop-blur-xl"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ duration: 0.42, ease: EASE }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Вход через Telegram"
          >
            {/* Золотое сияние над карточкой */}
            <div
              className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-[rgba(249,207,107,0.16)] blur-3xl"
              aria-hidden="true"
            />

            {/* Логотип Рыбки */}
            <motion.span
              className="relative inline-block text-[42px]"
              aria-hidden="true"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            >
              🐠
            </motion.span>

            <h2
              className="relative mt-3 mb-2 text-[clamp(24px,5vw,30px)] leading-tight text-white"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Синхронизация
            </h2>
            <p className="relative m-0 mb-7 text-[13px] leading-relaxed text-white/45">
              Войди через Telegram, чтобы твой Дневник и идеи сохранялись навсегда
            </p>

            {/* Золотая кнопка — невидимый iframe виджета Telegram ловит клик */}
            <div className="relative mx-auto h-[52px] w-full max-w-[280px]">
              <motion.div
                className="pointer-events-none flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border border-[rgba(249,207,107,0.55)] bg-[rgba(249,207,107,0.1)] py-3.5 text-[13.5px] font-medium text-[#ffe55c] shadow-[0_0_30px_rgba(249,207,107,0.28)] transition-shadow duration-200"
                aria-hidden="true"
                whileHover={{ boxShadow: '0 0 44px rgba(249,207,107,0.45)' }}
              >
                <Send size={15} strokeWidth={2} aria-hidden="true" />
                Войти через Telegram
              </motion.div>
              <div
                ref={widgetRef}
                className="absolute inset-0 overflow-hidden opacity-0 [&>iframe]:!h-full [&>iframe]:!w-full [&>iframe]:!border-0"
              />
            </div>

            {/* Гостевой режим — просто закрывает модалку */}
            <button
              type="button"
              className="mt-4 cursor-pointer rounded-full px-5 py-2.5 text-[12.5px] text-white/50 transition-colors duration-200 hover:text-white/85"
              onClick={handleClose}
            >
              Продолжить как гость
            </button>

            <p className="m-0 mt-4 text-[10.5px] leading-relaxed text-white/25">
              Официальный Telegram Login Widget · бот @{TELEGRAM_BOT_NAME}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
