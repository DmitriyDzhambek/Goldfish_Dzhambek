import type { SceneQuality } from '../../hooks/useSceneQuality'
import { cssVars } from '../../lib/css'
import styles from './SceneBackground.module.css'

interface SceneBackgroundProps {
  quality: SceneQuality
}

interface Star {
  x: number
  y: number
  size: number
  delay: number
  duration: number
  opacity: number
}

/** Детерминированный ПСЧ: звёзды не «прыгают» между рендерами. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state |= 0
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createStars(count: number): Star[] {
  const random = mulberry32(20260101)
  return Array.from({ length: count }, () => ({
    x: Number((random() * 100).toFixed(2)),
    y: Number((random() * 74).toFixed(2)),
    size: Number((0.9 + random() * 1.9).toFixed(2)),
    delay: Number((random() * 9).toFixed(2)),
    duration: Number((3.6 + random() * 6.4).toFixed(2)),
    opacity: Number((0.24 + random() * 0.62).toFixed(2)),
  }))
}

const STARS = createStars(56)

const WAVE_PATH =
  'M0 120 C120 80 240 80 360 120 C480 160 600 160 720 120 C840 80 960 80 1080 120 C1200 160 1320 160 1440 120 V240 H0 Z'

const WAVE_CREST =
  'M0 120 C120 80 240 80 360 120 C480 160 600 160 720 120 C840 80 960 80 1080 120 C1200 160 1320 160 1440 120'

function Wave({ className }: { className?: string }) {
  return (
    <div className={`${styles.waveTrack} ${className}`}>
      {[0, 1].map((copy) => (
        <svg
          key={copy}
          className={styles.wave}
          viewBox="0 0 1440 240"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={WAVE_PATH} fill="currentColor" />
          <path
            d={WAVE_CREST}
            fill="none"
            stroke="var(--wave-crest)"
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ))}
    </div>
  )
}

export function SceneBackground({ quality }: SceneBackgroundProps) {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.sky} />
      <div className={styles.glow} />

      {quality.caustics && (
        <div className={styles.caustics}>
          <span />
          <span />
          <span />
        </div>
      )}

      <div className={styles.stars}>
        {STARS.map((star, index) => (
          <span
            key={index}
            className={styles.star}
            style={{
              ...cssVars({
                '--star-delay': `${star.delay}s`,
                '--star-duration': `${star.duration}s`,
                '--star-opacity': star.opacity,
              }),
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
            }}
          />
        ))}
      </div>

      <div className={styles.beam} />
      <div className={styles.fog} />

      <div className={styles.waves}>
        <Wave className={styles.waveBack} />
        <Wave className={styles.waveMid} />
        <Wave className={styles.waveFront} />
      </div>

      <div className={styles.noise} />
    </div>
  )
}
