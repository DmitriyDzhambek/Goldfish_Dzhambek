import { motion, useReducedMotion } from 'framer-motion'
import { Croissant, Fish } from 'lucide-react'
import { CHARACTERS, type CharacterId } from '../../characters'
import styles from './CharacterSwitch.module.css'

interface CharacterSwitchProps {
  value: CharacterId
  onChange: (character: CharacterId) => void
}

const OPTIONS = [
  { id: 'fish', icon: Fish },
  { id: 'kolobok', icon: Croissant },
] as const satisfies ReadonlyArray<{ id: CharacterId; icon: typeof Fish }>

export function CharacterSwitch({ value, onChange }: CharacterSwitchProps) {
  const reducedMotion = useReducedMotion()

  return (
    <div className={styles.switch} role="group" aria-label="Выбор персонажа">
      {OPTIONS.map(({ id, icon: Icon }) => {
        const active = value === id
        const meta = CHARACTERS[id]

        return (
          <button
            key={id}
            type="button"
            className={[styles.option, active && styles.active].filter(Boolean).join(' ')}
            aria-pressed={active}
            aria-label={meta.name}
            title={meta.name}
            onClick={() => onChange(id)}
          >
            {active && (
              <motion.span
                layoutId="character-pill"
                className={styles.pill}
                transition={
                  reducedMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <Icon className={styles.icon} size={16} strokeWidth={1.9} aria-hidden="true" />
            <span className={styles.label}>{meta.short}</span>
          </button>
        )
      })}
    </div>
  )
}
