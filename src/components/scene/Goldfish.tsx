import { useEffect, useRef } from 'react'
import styles from './Goldfish.module.css'

export type GoldfishMood = 'idle' | 'listening' | 'thinking' | 'speaking'

interface GoldfishProps {
  mood?: GoldfishMood
  className?: string
  /** Следить ли зрачком за курсором (на тач-устройствах выключено). */
  gaze?: boolean
}

const BODY =
  'M296 120C290 94 266 76 228 70C176 62 122 78 100 104C94 111 90 116 86 120C90 124 94 129 100 136C122 162 176 178 228 170C266 164 290 146 296 120Z'

const TAIL = 'M96 118C74 104 48 86 26 78C34 96 40 108 42 120C40 132 34 144 26 162C48 154 74 136 96 122Z'

function classNames(...values: Array<string | false | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * SVG-рыбка. Движение — только transform/opacity.
 * Настроение управляет анимациями через CSS-класс, а не через JS-цикл.
 */
export function Goldfish({ mood = 'idle', className, gaze = true }: GoldfishProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!gaze) return

    const element = rootRef.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (window.matchMedia('(pointer: coarse)').matches) return

    let frame = 0
    let nextX = 0
    let nextY = 0

    const apply = () => {
      frame = 0
      element.style.setProperty('--gaze-x', nextX.toFixed(3))
      element.style.setProperty('--gaze-y', nextY.toFixed(3))
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      nextX = Math.max(-1, Math.min(1, (event.clientX - centerX) / (rect.width * 0.75)))
      nextY = Math.max(-1, Math.min(1, (event.clientY - centerY) / (rect.height * 0.75)))

      if (frame === 0) frame = window.requestAnimationFrame(apply)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (frame !== 0) window.cancelAnimationFrame(frame)
    }
  }, [gaze])

  return (
    <div
      ref={rootRef}
      className={classNames(styles.root, styles[mood], className)}
      data-pausable
    >
      <div className={styles.aura} aria-hidden="true" />

      <svg className={styles.svg} viewBox="0 0 360 240" role="img" aria-label="Золотая рыбка">
        <defs>
          <linearGradient id="zr-body" x1="0" y1="0.1" x2="0.9" y2="0.95">
            <stop offset="0%" stopColor="#fff5cf" />
            <stop offset="30%" stopColor="#ffe09a" />
            <stop offset="60%" stopColor="#f3bd55" />
            <stop offset="84%" stopColor="#d18e24" />
            <stop offset="100%" stopColor="#9c6512" />
          </linearGradient>

          <linearGradient id="zr-fin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff0bd" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#ffd77a" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#c9871c" stopOpacity="0.55" />
          </linearGradient>

          <radialGradient id="zr-shade" cx="0.3" cy="0.24" r="0.78">
            <stop offset="0%" stopColor="#fffbe6" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#fff2c2" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#7a4d0e" stopOpacity="0.16" />
          </radialGradient>

          <radialGradient id="zr-belly" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#fff4c8" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#fff4c8" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#fff4c8" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="zr-aura" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#f9cf6b" stopOpacity="0.22" />
            <stop offset="55%" stopColor="#f9cf6b" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#f9cf6b" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="zr-glint" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="50%" stopColor="#fffbe8" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <pattern id="zr-scales" width="26" height="18" patternUnits="userSpaceOnUse">
            <path
              d="M0 18Q13 4 26 18"
              fill="none"
              stroke="#8a5a12"
              strokeOpacity="0.18"
              strokeWidth="1.1"
            />
            <path
              d="M-13 9Q0 -5 13 9"
              fill="none"
              stroke="#8a5a12"
              strokeOpacity="0.1"
              strokeWidth="1"
            />
            <path
              d="M13 9Q26 -5 39 9"
              fill="none"
              stroke="#8a5a12"
              strokeOpacity="0.1"
              strokeWidth="1"
            />
          </pattern>

          <clipPath id="zr-clip">
            <path d={BODY} />
          </clipPath>
        </defs>

        <ellipse
          className={styles.auraGlow}
          cx="192"
          cy="126"
          rx="158"
          ry="94"
          fill="url(#zr-aura)"
        />

        <g className={styles.swimmer}>
          {/* Хвост */}
          <g className={styles.tail}>
            <path d={TAIL} fill="url(#zr-fin)" stroke="#ffe6a1" strokeOpacity="0.35" />
            <path
              d="M92 120C74 111 58 102 44 92"
              fill="none"
              stroke="#ffe7a0"
              strokeOpacity="0.5"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M92 120C74 129 58 138 44 148"
              fill="none"
              stroke="#ffe7a0"
              strokeOpacity="0.5"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M90 120C76 120 62 120 50 120"
              fill="none"
              stroke="#ffe7a0"
              strokeOpacity="0.4"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </g>

          {/* Плавники за телом */}
          <g className={styles.dorsal}>
            <path
              d="M186 68C196 46 218 34 238 38C226 50 220 60 218 73Z"
              fill="url(#zr-fin)"
              stroke="#ffe6a1"
              strokeOpacity="0.3"
            />
          </g>
          <g className={styles.ventral}>
            <path
              d="M196 171C204 190 222 200 240 196C230 186 226 178 224 168Z"
              fill="url(#zr-fin)"
              stroke="#ffe6a1"
              strokeOpacity="0.3"
            />
          </g>

          {/* Тело */}
          <g className={styles.bodyGroup}>
            <path
              d={BODY}
              fill="url(#zr-body)"
              stroke="rgba(255, 226, 150, 0.6)"
              strokeWidth="1.2"
            />

            <g clipPath="url(#zr-clip)">
              <path d={BODY} fill="url(#zr-shade)" />
              <ellipse cx="200" cy="132" rx="94" ry="48" fill="url(#zr-belly)" />
              <path d={BODY} fill="url(#zr-scales)" />
              <g className={styles.glint}>
                <rect
                  x="-100"
                  y="18"
                  width="66"
                  height="200"
                  fill="url(#zr-glint)"
                  transform="rotate(14 0 0)"
                />
              </g>
            </g>

            <path
              d="M240 93C234 106 234 134 240 147"
              fill="none"
              stroke="#7a4d0e"
              strokeOpacity="0.32"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M160 84C176 100 182 118 178 136"
              fill="none"
              stroke="#7a4d0e"
              strokeOpacity="0.12"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>

          {/* Грудной плавник — поверх тела */}
          <g className={styles.pectoral}>
            <path
              d="M228 126C244 131 262 137 275 136C268 150 248 154 232 146C227 140 226 132 228 126Z"
              fill="url(#zr-fin)"
              stroke="#ffe6a1"
              strokeOpacity="0.4"
              opacity="0.92"
            />
            <path
              d="M234 132C246 136 258 139 268 139"
              fill="none"
              stroke="#8a5a12"
              strokeOpacity="0.25"
              strokeWidth="1.1"
              strokeLinecap="round"
            />
          </g>

          {/* Глаз */}
          <g className={styles.eye}>
            <ellipse cx="259" cy="103" rx="10.5" ry="11" fill="#fff8e3" />
            <g className={styles.eyeGaze}>
              <circle cx="261" cy="103" r="6.6" fill="#2a1a08" />
              <circle cx="262.4" cy="103" r="3.6" fill="#120a03" />
              <circle cx="263.6" cy="100.4" r="2" fill="#fffdf4" />
              <circle cx="258.4" cy="105.6" r="1" fill="#ffe9ab" opacity="0.85" />
            </g>
            <ellipse
              cx="259"
              cy="103"
              rx="11"
              ry="11.2"
              fill="#e9b348"
              opacity="0.92"
              className={styles.eyelid}
            />
            <path
              d="M248 96C252 92 258 90 264 91"
              fill="none"
              stroke="#7a4d0e"
              strokeOpacity="0.25"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </g>

          {/* Рот */}
          <g className={styles.mouth}>
            <path
              d="M293 120C288 123 287 128 290 131"
              fill="none"
              stroke="#7a4d0e"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M290 131C292 133 294.5 133.5 296 132.5"
              fill="none"
              stroke="#7a4d0e"
              strokeOpacity="0.7"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
        </g>
      </svg>

      <div className={styles.thought} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  )
}
