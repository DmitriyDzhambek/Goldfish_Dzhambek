import { Fragment, type ReactNode } from 'react'
import styles from './MessageText.module.css'

function renderInline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)

  return parts.map((part, index) => {
    const key = `${keyBase}-${index}`

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }

    return <Fragment key={key}>{part}</Fragment>
  })
}

interface MessageTextProps {
  text: string
}

/**
 * Минимальный и безопасный markdown: абзацы, списки, заголовки, код,
 * жирный/курсив. Никакого dangerouslySetInnerHTML и внешних ссылок.
 */
export function MessageText({ text }: MessageTextProps) {
  const blocks: ReactNode[] = []
  const lines = text.split('\n')

  let list: string[] = []
  let listKind: 'ul' | 'ol' = 'ul'
  let code: string[] | null = null
  let codeFirstLine = false

  const flushList = () => {
    if (list.length === 0) return

    const items = list
    const key = `list-${blocks.length}`
    blocks.push(
      listKind === 'ol' ? (
        <ol key={key}>
          {items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key}>
          {items.map((item, index) => (
            <li key={`${key}-${index}`}>{renderInline(item, `${key}-${index}`)}</li>
          ))}
        </ul>
      ),
    )

    list = []
  }

  const flushCode = () => {
    if (code === null) return

    const key = `code-${blocks.length}`
    blocks.push(
      <pre key={key}>
        <code>{code.join('\n')}</code>
      </pre>,
    )
    code = null
  }

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (code === null) {
        flushList()
        code = []
        codeFirstLine = true
      } else {
        flushCode()
      }
      continue
    }

    if (code !== null) {
      if (codeFirstLine && /^[\w+-]+$/.test(line.trim())) {
        codeFirstLine = false
        continue
      }
      codeFirstLine = false
      code.push(line)
      continue
    }

    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushList()
      const content = heading[2] ?? ''
      blocks.push(
        <h3 key={`heading-${blocks.length}`}>{renderInline(content, `heading-${blocks.length}`)}</h3>,
      )
      continue
    }

    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      if (list.length > 0 && listKind !== 'ul') flushList()
      listKind = 'ul'
      list.push(bullet[1] ?? '')
      continue
    }

    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed)
    if (numbered) {
      if (list.length > 0 && listKind !== 'ol') flushList()
      listKind = 'ol'
      list.push(numbered[1] ?? '')
      continue
    }

    flushList()
    blocks.push(
      <p key={`p-${blocks.length}`}>{renderInline(trimmed, `p-${blocks.length}`)}</p>,
    )
  }

  flushList()
  flushCode()

  return <div className={styles.text}>{blocks}</div>
}
