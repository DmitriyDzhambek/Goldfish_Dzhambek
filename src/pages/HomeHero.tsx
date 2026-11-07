import { motion, useReducedMotion } from 'framer-motion'
import { Check, Sparkles } from 'lucide-react'
import { CHARACTERS, type CharacterId } from '../characters'
import { Goldfish } from '../components/scene/Goldfish'
import { Kolobok } from '../components/scene/Kolobok'
import { GlassCard } from '../components/ui/GlassCard'
import styles from './HomeHero.module.css'

interface HomeHeroProps {
  character: CharacterId
}

const CHIPS = ['∞ желаний', 'без регистрации', 'бесплатно навсегда']
const READY = ['Сцена', 'Дизайн-система', 'API-скелет']

const EASE = [0.22, 0.61, 0.36, 1] as const

export function HomeHero({ character }: HomeHeroProps) {
  const reducedMotion = useReducedMotion()
  const meta = CHARACTERS[character]
  const duration = reducedMotion ? 0 : 0.55
  const delay = (value: number) => (reducedMotion ? 0 : value)

  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <motion.p
        className={styles.eyebrow}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration, delay: delay(0.05) }}
      >
        невод → желание → исполнение
      </motion.p>

      <motion.h1
        id="hero-title"
        className={styles.title}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration, delay: delay(0.1), ease: EASE }}
      >
        {meta.name}
      </motion.h1>

      <motion.div
        className={styles.stage}
        initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reducedMotion ? 0 : 1.1, delay: delay(0.15), ease: EASE }}
      >
        {character === 'fish' ? <Goldfish /> : <Kolobok />}
      </motion.div>

      <motion.p
        className={styles.lead}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration, delay: delay(0.3), ease: EASE }}
      >
        {meta.lead}
      </motion.p>

      <motion.ul
        className={styles.chips}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration, delay: delay(0.4) }}
      >
        {CHIPS.map((chip) => (
          <li key={chip}>{chip}</li>
        ))}
      </motion.ul>

      <motion.div
        className={styles.noteWrap}
        initial={{ opacity: 0, y: reducedMotion ? 0 : 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.6, delay: delay(0.5), ease: EASE }}
      >
        <GlassCard className={styles.note}>
          <div className={styles.noteTop}>
            <span className={styles.badge}>Этап 1</span>
            <span className={styles.noteTitle}>Фундамент готов</span>
            <Sparkles className={styles.noteIcon} size={15} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <p className={styles.noteText}>
            Ночное море, живая рыбка и стеклянные карточки на месте. Дальше — чат со
            стримингом, желания и память.
          </p>
          <ul className={styles.ready}>
            {READY.map((label) => (
              <li key={label}>
                <span className={styles.check} aria-hidden="true">
                  <Check size={11} strokeWidth={2.8} />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </GlassCard>
      </motion.div>
    </section>
  )
}
