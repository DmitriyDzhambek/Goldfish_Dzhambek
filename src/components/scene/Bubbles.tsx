import { useEffect, useRef } from 'react'
import styles from './Bubbles.module.css'

interface BubblesProps {
  /** false — слабое устройство или prefers-reduced-motion. */
  enabled: boolean
}

interface Bubble {
  x: number
  y: number
  radius: number
  speed: number
  drift: number
  phase: number
  opacity: number
}

const TAU = Math.PI * 2

/**
 * Пузырьки на Canvas 2D. Один rAF-цикл, DPR не выше 2,
 * пауза при скрытой вкладке, полное отключение на слабых устройствах.
 */
export function Bubbles({ enabled }: BubblesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !enabled) return

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let frame = 0
    let lastTime = 0
    let bubbles: Bubble[] = []

    const random = (min: number, max: number) => min + Math.random() * (max - min)

    const spawn = (initial: boolean): Bubble => ({
      x: random(0, width),
      y: initial ? random(0, height) : height + random(12, 70),
      radius: random(1.4, 5.4),
      speed: random(13, 40),
      drift: random(5, 20),
      phase: random(0, TAU),
      opacity: random(0.16, 0.5),
    })

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight

      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const target = Math.round(Math.min(34, Math.max(12, (width * height) / 46000)))
      if (bubbles.length > target) bubbles = bubbles.slice(0, target)
      while (bubbles.length < target) bubbles.push(spawn(true))
    }

    const draw = (time: number) => {
      const delta = Math.min((time - lastTime) / 1000, 0.05)
      lastTime = time
      context.clearRect(0, 0, width, height)

      for (let index = 0; index < bubbles.length; index += 1) {
        const bubble = bubbles[index]
        if (!bubble) continue

        bubble.y -= bubble.speed * delta
        bubble.phase += delta * 0.9
        const x = bubble.x + Math.sin(bubble.phase) * bubble.drift

        if (bubble.y < -20) {
          bubbles[index] = spawn(false)
          continue
        }

        context.beginPath()
        context.arc(x, bubble.y, bubble.radius, 0, TAU)
        context.fillStyle = `rgba(190, 235, 255, ${bubble.opacity * 0.14})`
        context.fill()
        context.strokeStyle = `rgba(255, 236, 180, ${bubble.opacity * 0.55})`
        context.lineWidth = 0.9
        context.stroke()

        context.beginPath()
        context.arc(
          x - bubble.radius * 0.32,
          bubble.y - bubble.radius * 0.34,
          bubble.radius * 0.22,
          0,
          TAU,
        )
        context.fillStyle = `rgba(255, 255, 255, ${bubble.opacity * 0.7})`
        context.fill()
      }

      frame = window.requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.cancelAnimationFrame(frame)
        frame = 0
        return
      }

      if (frame === 0) {
        lastTime = performance.now()
        frame = window.requestAnimationFrame(draw)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    lastTime = performance.now()
    frame = window.requestAnimationFrame(draw)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [enabled])

  if (!enabled) return null

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
}
