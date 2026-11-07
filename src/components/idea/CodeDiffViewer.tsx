/**
 * Окно кода в стиле VS Code: тёмный фон, моноширинный шрифт,
 * подсветка синтаксиса и, когда есть предыдущая версия файла,
 * настоящий diff (зелёное/красное, как на GitHub).
 *
 * «Скопировать патч» кладёт в буфер унифицированный diff —
 * его можно применить командой `git apply`.
 */

import { useMemo, useState } from 'react'
import { Clipboard, Check, FileCode2, GitCompareArrows, X } from 'lucide-react'
import { highlight } from '../../idea/highlight'
import type { IdeaArtifact } from '../../idea/ideaEngine'
import styles from './CodeDiffViewer.module.css'

interface CodeDiffViewerProps {
  artifact: IdeaArtifact
  /** Предыдущая версия этого же файла — включает режим diff. */
  previousCode?: string | null
  streaming?: boolean
  onClose?: () => void
}

/* ── Diff по строкам (LCS) ──────────────────────────────────── */

type RowType = 'add' | 'del' | 'ctx'

interface DiffRow {
  type: RowType
  text: string
}

function diffLines(oldText: string, newText: string): DiffRow[] {
  const a = oldText.length > 0 ? oldText.split('\n') : []
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  if (n * m > 2_000_000) {
    return [
      ...a.map((text): DiffRow => ({ type: 'del', text })),
      ...b.map((text): DiffRow => ({ type: 'add', text })),
    ]
  }

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i]![j] = a[i] === b[j]
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const rows: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: 'ctx', text: a[i]! })
      i += 1
      j += 1
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      rows.push({ type: 'del', text: a[i]! })
      i += 1
    } else {
      rows.push({ type: 'add', text: b[j]! })
      j += 1
    }
  }
  while (i < n) {
    rows.push({ type: 'del', text: a[i]! })
    i += 1
  }
  while (j < m) {
    rows.push({ type: 'add', text: b[j]! })
    j += 1
  }
  return rows
}

function buildPatch(fileName: string, rows: DiffRow[]): string {
  const body = rows
    .map((row) => `${row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}${row.text}`)
    .join('\n')
  return `--- a/${fileName}\n+++ b/${fileName}\n${body}`
}

/* ── Копирование в буфер с запасным вариантом ───────────────── */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.hidden = true
      document.body.appendChild(area)
      area.select()
      const ok = document.execCommand('copy')
      area.remove()
      return ok
    } catch {
      return false
    }
  }
}

/* ── Компонент ──────────────────────────────────────────────── */

export function CodeDiffViewer({ artifact, previousCode, streaming = false, onClose }: CodeDiffViewerProps) {
  const hasDiff = typeof previousCode === 'string'
  const [view, setView] = useState<'code' | 'diff'>(hasDiff ? 'diff' : 'code')
  const [copied, setCopied] = useState<'code' | 'patch' | null>(null)

  const codeNodes = useMemo(() => highlight(artifact.code), [artifact.code])
  const rows = useMemo(
    () => (hasDiff ? diffLines(previousCode ?? '', artifact.code) : []),
    [hasDiff, previousCode, artifact.code],
  )

  async function handleCopy(kind: 'code' | 'patch'): Promise<void> {
    const text = kind === 'code' ? artifact.code : buildPatch(artifact.fileName, rows)
    const ok = await copyText(text)
    if (ok) {
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1800)
    }
  }

  return (
    <div className={styles.viewer}>
      <header className={styles.toolbar}>
        <div className={styles.fileInfo}>
          <FileCode2 size={15} strokeWidth={1.7} className={styles.fileIcon} aria-hidden="true" />
          <span className={styles.fileName} title={artifact.fileName}>
            {artifact.fileName}
          </span>
          <span className={styles.badge}>{artifact.language.toUpperCase()}</span>
          {streaming && <span className={styles.streamDot} aria-label="Рыбка печатает код" />}
        </div>

        <div className={styles.actions}>
          {hasDiff && (
            <div className={styles.viewSwitch} role="tablist" aria-label="Режим просмотра">
              <button
                type="button"
                role="tab"
                aria-selected={view === 'code'}
                className={[styles.switchBtn, view === 'code' && styles.switchActive].filter(Boolean).join(' ')}
                onClick={() => setView('code')}
              >
                Код
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === 'diff'}
                className={[styles.switchBtn, view === 'diff' && styles.switchActive].filter(Boolean).join(' ')}
                onClick={() => setView('diff')}
              >
                <GitCompareArrows size={13} strokeWidth={1.8} aria-hidden="true" />
                Diff
              </button>
            </div>
          )}

          <button type="button" className={styles.actionBtn} onClick={() => handleCopy('code')}>
            {copied === 'code' ? (
              <>
                <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                Скопировано!
              </>
            ) : (
              'Скопировать код'
            )}
          </button>

          <button
            type="button"
            className={[styles.actionBtn, styles.actionGold].filter(Boolean).join(' ')}
            onClick={() => handleCopy('patch')}
            disabled={rows.length === 0 && !hasDiff}
            title="Унифицированный diff — применяется через git apply"
          >
            {copied === 'patch' ? (
              <>
                <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                Скопировано!
              </>
            ) : (
              <>
                <Clipboard size={13} strokeWidth={1.9} aria-hidden="true" />
                Скопировать патч
              </>
            )}
          </button>

          {onClose && (
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть окно кода">
              <X size={15} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {view === 'code' ? (
          <pre className={styles.code} tabIndex={0}>
            <code>{codeNodes}</code>
          </pre>
        ) : (
          <pre className={styles.code} tabIndex={0}>
            <code>
              {rows.map((row, index) => (
                <span key={index} className={styles[row.type]}>
                  <span className={styles.sign} aria-hidden="true">
                    {row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}
                  </span>
                  {highlight(row.text)}
                </span>
              ))}
            </code>
          </pre>
        )}
        {streaming && <span className={styles.caret} aria-hidden="true" />}
      </div>
    </div>
  )
}
