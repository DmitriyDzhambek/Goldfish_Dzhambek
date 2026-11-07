import styles from './Kolobok.module.css'

interface KolobokProps {
  className?: string
}

/**
 * Запасной персонаж переключателя. Намеренно проще рыбки:
 * это тёплая «медаль», а не вторая полноценная сцена.
 */
export function Kolobok({ className }: KolobokProps) {
  return (
    <div className={[styles.root, className].filter(Boolean).join(' ')}>
      <div className={styles.aura} aria-hidden="true" />
      <svg className={styles.svg} viewBox="0 0 360 240" role="img" aria-label="Колобок">
        <defs>
          <radialGradient id="kb-bun" cx="0.36" cy="0.28" r="0.82">
            <stop offset="0%" stopColor="#ffe9b8" />
            <stop offset="38%" stopColor="#f7c46a" />
            <stop offset="72%" stopColor="#d99433" />
            <stop offset="100%" stopColor="#9c5f14" />
          </radialGradient>
          <radialGradient id="kb-aura" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffd28a" stopOpacity="0.28" />
            <stop offset="60%" stopColor="#ffd28a" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#ffd28a" stopOpacity="0" />
          </radialGradient>
        </defs>

        <ellipse cx="184" cy="128" rx="150" ry="92" fill="url(#kb-aura)" />

        <g className={styles.bun}>
          <circle cx="182" cy="124" r="78" fill="url(#kb-bun)" stroke="rgba(255, 228, 168, 0.55)" />

          <circle cx="156" cy="112" r="5.4" fill="#3a2408" className={styles.eye} />
          <circle cx="210" cy="112" r="5.4" fill="#3a2408" className={styles.eye} />
          <circle cx="157.6" cy="110.4" r="1.6" fill="#fff8dc" />
          <circle cx="211.6" cy="110.4" r="1.6" fill="#fff8dc" />

          <path
            d="M160 141C170 151 194 151 204 141"
            fill="none"
            stroke="#7a4d0e"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <circle cx="139" cy="134" r="10" fill="#e8833a" opacity="0.25" />
          <circle cx="225" cy="134" r="10" fill="#e8833a" opacity="0.25" />

          <circle cx="148" cy="74" r="2.6" fill="#fff3d0" opacity="0.55" />
          <circle cx="212" cy="82" r="2" fill="#fff3d0" opacity="0.45" />
          <circle cx="196" cy="66" r="1.6" fill="#fff3d0" opacity="0.4" />
          <circle cx="166" cy="60" r="1.8" fill="#fff3d0" opacity="0.35" />
          <circle cx="238" cy="120" r="1.8" fill="#fff3d0" opacity="0.3" />
        </g>
      </svg>
    </div>
  )
}
