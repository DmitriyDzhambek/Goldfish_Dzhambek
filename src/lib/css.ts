import type { CSSProperties } from 'react'

/**
 * Помогает прокидывать CSS-переменные в inline-стили без `as any`.
 * Пример: style={cssVars({ '--delay': '120ms' })}
 */
export function cssVars(values: Record<`--${string}`, string | number>): CSSProperties {
  return values as CSSProperties
}
