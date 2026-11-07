import type { LucideIcon } from 'lucide-react'
import { GlassCard } from '../components/ui/GlassCard'
import styles from './StagePage.module.css'

interface StagePageProps {
  id: string
  stage: string
  title: string
  description: string
  icon: LucideIcon
  items: string[]
}

/**
 * Честная заглушка следующего этапа: объясняет, что появится,
 * вместо пустого экрана с «coming soon».
 */
export function StagePage({ id, stage, title, description, icon: Icon, items }: StagePageProps) {
  return (
    <section className={styles.page} aria-labelledby={`stage-title-${id}`}>
      <GlassCard className={styles.card} interactive>
        <div className={styles.head}>
          <span className={styles.iconWrap} aria-hidden="true">
            <Icon size={22} strokeWidth={1.8} />
          </span>
          <span className={styles.badge}>{stage}</span>
        </div>

        <h2 id={`stage-title-${id}`} className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>

        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item}>
              <span className={styles.dot} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>

        <p className={styles.footer}>Проект бесплатный и без лимитов — навсегда.</p>
      </GlassCard>
    </section>
  )
}
