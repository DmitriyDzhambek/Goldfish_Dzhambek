/**
 * Лёгкая подсветка синтаксиса — аналог react-syntax-highlighter,
 * но без внешних зависимостей: приложение остаётся полностью офлайн.
 *
 * Один проход regex-токенизатора, безопасный для частично напечатанного
 * кода (незакрытая строка просто не подсвечивается, ничего не падает).
 */

import type { ReactNode } from 'react'

const KEYWORDS =
  'import|export|from|default|const|let|var|function|return|if|else|await|async|new|class|extends|implements|type|interface|enum|as|for|of|in|null|undefined|true|false|try|catch|finally|throw|switch|case|break|continue|typeof|instanceof|void|public|private|readonly|static|get|set|def|lambda|pass|with|elif|not|and|or|None|True|False|self'

/** JS/TS/CSS/JSON-семейство. */
const TOKEN_RE = new RegExp(
  [
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?(?:\\*\\/|$)|#[^\\n]*)', // 1: комментарий (в CSS/JS # — редко, в начале строки)
    '("(?:[^"\\\\\\n]|\\\\.)*"?|\'(?:[^\'\\\\\\n]|\\\\.)*\'?|`(?:[^`\\\\]|\\\\.)*`?)', // 2: строка
    `\\b(${KEYWORDS})\\b`, // 3: ключевое слово
    '(<\\/?[A-Za-z][\\w.:-]*|\\/?>)', // 4: JSX-тег
    '(\\b0x[\\da-fA-F]+\\b|\\b\\d[\\d_]*(?:\\.\\d+)?(?:px|rem|em|%|s|ms)?\\b)', // 5: число
    '\\b([A-Z][A-Za-z0-9_]*)\\b', // 6: тип/компонент
  ].join('|'),
  'g',
)

export interface HighlightToken {
  text: string
  cls: string | null
}

export function tokenize(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = []
  let lastIndex = 0

  TOKEN_RE.lastIndex = 0
  for (let match = TOKEN_RE.exec(code); match !== null; match = TOKEN_RE.exec(code)) {
    if (match.index > lastIndex) {
      tokens.push({ text: code.slice(lastIndex, match.index), cls: null })
    }

    const cls = match[1]
      ? 'hl-comment'
      : match[2]
        ? 'hl-string'
        : match[3]
          ? 'hl-keyword'
          : match[4]
            ? 'hl-tag'
            : match[5]
              ? 'hl-number'
              : match[6]
                ? 'hl-type'
                : null

    tokens.push({ text: match[0], cls })
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < code.length) {
    tokens.push({ text: code.slice(lastIndex), cls: null })
  }

  return tokens
}

/** Возвращает готовые React-узлы с цветными span-ами. */
export function highlight(code: string): ReactNode[] {
  return tokenize(code).map((token, index) => {
    if (token.cls === null) return token.text
    return (
      <span key={index} className={token.cls}>
        {token.text}
      </span>
    )
  })
}
