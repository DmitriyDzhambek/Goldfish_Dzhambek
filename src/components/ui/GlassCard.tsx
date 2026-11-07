import type { HTMLAttributes, ReactNode } from 'react'
import styles from './GlassCard.module.css'

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Добавляет мягкий подъём и золотую тень при наведении. */
  interactive?: boolean
  children: ReactNode
}

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ')
}

export function GlassCard({ interactive = false, className, children, ...rest }: GlassCardProps) {
  return (
    <div
      className={classNames(styles.card, interactive && styles.interactive, className)}
      {...rest}
    >
      {children}
    </div>
  )
}
