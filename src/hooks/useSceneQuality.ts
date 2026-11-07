import { useEffect, useState } from 'react'

export interface SceneQuality {
  /** Пользователь просит меньше движения. */
  reducedMotion: boolean
  /** Слабый телефон, экономия трафика или мало памяти. */
  lowPower: boolean
  /** Можно ли запускать лёгкие Canvas-частицы. */
  particles: boolean
  /** Можно ли показывать каустики (световые пятна). */
  caustics: boolean
  tier: 'full' | 'lite'
}

interface QualityInput {
  reducedMotion: boolean
  lowPower: boolean
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

function detectQuality(): QualityInput {
  if (typeof window === 'undefined') {
    return { reducedMotion: false, lowPower: false }
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const navigatorHints = navigator as NavigatorWithHints
  const cores = navigator.hardwareConcurrency ?? 8
  const memory = navigatorHints.deviceMemory ?? 8
  const saveData = navigatorHints.connection?.saveData ?? false

  return {
    reducedMotion,
    lowPower: cores <= 4 || memory <= 4 || saveData,
  }
}

/**
 * Один источник правды о качестве сцены.
 * Результат выставляется на <html> в data-атрибуты, поэтому CSS-анимации
 * тоже могут на него реагировать.
 */
export function useSceneQuality(): SceneQuality {
  const [input, setInput] = useState<QualityInput>(detectQuality)

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setInput(detectQuality())

    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    const lite = input.reducedMotion || input.lowPower
    root.dataset.quality = lite ? 'lite' : 'full'
    root.dataset.motion = input.reducedMotion ? 'reduced' : 'full'
  }, [input])

  // Когда вкладка скрыта, ставим CSS-анимации на паузу.
  useEffect(() => {
    const root = document.documentElement
    const update = () => {
      root.dataset.paused = document.visibilityState === 'hidden' ? 'true' : 'false'
    }

    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  const lite = input.reducedMotion || input.lowPower
  return {
    reducedMotion: input.reducedMotion,
    lowPower: input.lowPower,
    particles: !lite,
    caustics: !lite,
    tier: lite ? 'lite' : 'full',
  }
}
