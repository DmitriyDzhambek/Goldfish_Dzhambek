import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  BookOpen,
  MessageCircle,
  Settings,
  Shield,
  type LucideIcon,
} from 'lucide-react'
import styles from './BottomNav.module.css'

export type TabId = 'home' | 'history' | 'diary' | 'admin' | 'settings'

interface BottomNavProps {
  value: TabId
  onChange: (tab: TabId) => void
  /** Пользователь-владелец: появляется вкладка «Админка». */
  isAdmin?: boolean
}

interface NavItem {
  id: TabId
  label: string
  icon: LucideIcon
}

// Минимализм по Джобсу: базовые три точки входа, четвёртая — только для админа.
const BASE_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'home', label: 'Чат', icon: MessageCircle },
  { id: 'diary', label: 'Дневник', icon: BookOpen },
  { id: 'settings', label: 'Настройки', icon: Settings },
]

const ADMIN_ITEM: NavItem = { id: 'admin', label: 'Админка', icon: Shield }

export function BottomNav({ value, onChange, isAdmin = false }: BottomNavProps) {
  const reducedMotion = useReducedMotion()

  const items = useMemo<ReadonlyArray<NavItem>>(() => {
    if (!isAdmin) return BASE_ITEMS
    const [home, diary, settings] = BASE_ITEMS
    return [home, diary, ADMIN_ITEM, settings].filter(
      (item): item is NavItem => item !== undefined,
    )
  }, [isAdmin])

  return (
    <nav
      className={styles.nav}
      aria-label="Основная навигация"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <AnimatePresence initial={false}>
        {items.map(({ id, label, icon: Icon }) => {
          const active = value === id

          return (
            <motion.button
              key={id}
              type="button"
              layout
              className={[styles.item, active && styles.active].filter(Boolean).join(' ')}
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(id)}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.72 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reducedMotion ? undefined : { opacity: 0, scale: 0.72 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
            >
              {active && (
                <motion.span
                  layoutId="nav-pill"
                  className={styles.pill}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 420, damping: 36 }
                  }
                />
              )}
              <Icon className={styles.icon} size={20} strokeWidth={1.8} aria-hidden="true" />
              <span className={styles.label}>{label}</span>
            </motion.button>
          )
        })}
      </AnimatePresence>
    </nav>
  )
}
