import { motion, useReducedMotion } from 'framer-motion'
import { BrainCircuit, MessageCircle, Sparkles, UserRound, type LucideIcon } from 'lucide-react'
import styles from './BottomNav.module.css'

export type TabId = 'home' | 'wishes' | 'memory' | 'profile'

interface BottomNavProps {
  value: TabId
  onChange: (tab: TabId) => void
}

const ITEMS: ReadonlyArray<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'home', label: 'Чат', icon: MessageCircle },
  { id: 'wishes', label: 'Желания', icon: Sparkles },
  { id: 'memory', label: 'Память', icon: BrainCircuit },
  { id: 'profile', label: 'Профиль', icon: UserRound },
]

export function BottomNav({ value, onChange }: BottomNavProps) {
  const reducedMotion = useReducedMotion()

  return (
    <nav className={styles.nav} aria-label="Основная навигация">
      {ITEMS.map(({ id, label, icon: Icon }) => {
        const active = value === id

        return (
          <button
            key={id}
            type="button"
            className={[styles.item, active && styles.active].filter(Boolean).join(' ')}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(id)}
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
          </button>
        )
      })}
    </nav>
  )
}
