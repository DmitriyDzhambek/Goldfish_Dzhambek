import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  BookOpen,
  Braces,
  Check,
  Copy,
  ExternalLink,
  FileCode2,
  FolderOpen,
  Github,
  KeyRound,
  Loader2,
  Monitor,
  RefreshCw,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  Wand2,
  Waves,
  X,
} from 'lucide-react'
import { api, ApiError, type VibeChange, type VibeMode, type VibeResponse } from '../api/client'
import {
  clearWorkspace,
  demoWorkspace,
  detectLanguage,
  filesForServer,
  formatBytes,
  importGitHub,
  loadWorkspace,
  pickFolder,
  readGitHubToken,
  saveGitHubToken,
  saveWorkspace,
  WorkspaceError,
  type Workspace,
  type WorkspaceFile,
} from '../vibecoding/workspace'
import { buildPreviewDocument, previewBlobUrl } from '../vibecoding/preview'

const MAX_TASK = 8000
const DEFAULT_SELECTION = 24

const PRIORITY_NAMES = [
  'readme.md',
  'package.json',
  'pyproject.toml',
  'vite.config.ts',
  'tsconfig.json',
  'src/app.tsx',
  'src/app.ts',
  'src/main.tsx',
  'src/main.ts',
  'app.tsx',
  'app.ts',
  'main.py',
  'server.py',
]

const PROVIDER_LABEL: Record<string, string> = {
  primary: 'основная модель',
  fallback: 'резервная модель',
  ollama: 'локальная модель',
  offline: 'офлайн-разбор',
}

const MODES: ReadonlyArray<{ id: VibeMode; label: string; hint: string }> = [
  { id: 'generate', label: 'Сгенерировать', hint: 'план и готовый код' },
  { id: 'explain', label: 'Объяснить', hint: 'разбор выбранных файлов' },
]

const EASE = [0.22, 0.61, 0.36, 1] as const

/* ── Diff по строкам: настоящее зелёное/красное, как на GitHub ── */

type DiffRowType = 'add' | 'del' | 'ctx'

interface DiffRow {
  type: DiffRowType
  text: string
}

function diffLines(oldText: string, newText: string): DiffRow[] {
  const a = oldText.length > 0 ? oldText.split('\n') : []
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  // Слишком большие файлы — не тянем O(n·m), показываем всё как добавленное.
  if (n * m > 2_000_000) {
    return [
      ...a.map((text): DiffRow => ({ type: 'del', text })),
      ...b.map((text): DiffRow => ({ type: 'add', text })),
    ]
  }

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      const same = a[i] === b[j]
      lcs[i]![j] = same
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

function buildPatchText(path: string, rows: DiffRow[]): string {
  const body = rows
    .map((row) => `${row.type === 'add' ? '+' : row.type === 'del' ? '-' : ' '}${row.text}`)
    .join('\n')
  return `--- a/${path}\n+++ b/${path}\n${body}`
}

/* ── Вспомогательное ── */

function scoreFile(path: string): number {
  const lower = path.toLowerCase()
  const name = lower.split('/').pop() ?? lower
  let score = 0

  if (PRIORITY_NAMES.includes(name) || PRIORITY_NAMES.includes(lower)) score += 40
  if (lower.startsWith('src/') || lower.startsWith('app/')) score += 8
  if (/(component|page|hook|api|client|store|service)/.test(lower)) score += 6
  if (/(test|spec|lock|min\.)/.test(name)) score -= 10
  score -= lower.split('/').length * 0.5

  return score
}

function defaultSelection(files: Workspace['files']): Set<string> {
  const ordered = [...files].sort((a, b) => scoreFile(b.path) - scoreFile(a.path))
  return new Set(ordered.slice(0, DEFAULT_SELECTION).map((file) => file.path))
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof WorkspaceError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Что-то пошло не так. Попробуй ещё раз.'
}

function providerLabel(provider: string | null): string {
  if (!provider) return PROVIDER_LABEL.offline ?? 'офлайн-разбор'
  return PROVIDER_LABEL[provider] ?? provider
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'недавно'

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
})

/* ── Пульсирующие точки: рыбка «думает» ── */

function ThinkingDots({ reduced }: { reduced: boolean | null }) {
  return (
    <span className="mt-6 flex items-center justify-center gap-2.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-2 w-2 rounded-full bg-gold shadow-[0_0_12px_rgba(255,215,0,0.6)]"
          animate={
            reduced
              ? { opacity: 0.7 }
              : { opacity: [0.25, 1, 0.25], scale: [0.85, 1.2, 0.85], y: [0, -5, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 1.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.22 }
          }
        />
      ))}
    </span>
  )
}

/* ── Блок изменения в стиле GitHub ── */

interface DiffBlockProps {
  change: VibeChange
  oldContent: string | null
  patchCopied: boolean
  codeCopied: boolean
  canApply: boolean
  onCopyPatch: () => void
  onCopyCode: () => void
  onApply: () => void
}

function DiffBlock({
  change,
  oldContent,
  patchCopied,
  codeCopied,
  canApply,
  onCopyPatch,
  onCopyCode,
  onApply,
}: DiffBlockProps) {
  const rows = useMemo(() => diffLines(oldContent ?? '', change.code), [oldContent, change.code])
  const added = useMemo(() => rows.filter((row) => row.type === 'add').length, [rows])
  const removed = useMemo(() => rows.filter((row) => row.type === 'del').length, [rows])
  const isNewFile = oldContent === null

  const rowClass: Record<DiffRowType, string> = {
    add: 'bg-diff-add-bg text-emerald-100/90',
    del: 'bg-diff-del-bg text-rose-100/70',
    ctx: 'text-white/50',
  }
  const gutterMark: Record<DiffRowType, string> = { add: '+', del: '−', ctx: ' ' }

  return (
    <motion.figure
      {...fadeUp(0.05)}
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d1117]/95 shadow-[0_26px_70px_-46px_rgba(0,0,0,1)]"
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <FileCode2 size={14} strokeWidth={1.9} className="shrink-0 text-gold" aria-hidden="true" />
          <span className="truncate font-mono text-white/85">{change.path}</span>
          {isNewFile && (
            <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-200">
              новый файл
            </span>
          )}
          {change.language && (
            <span className="shrink-0 rounded-full border border-aqua/25 px-2 py-0.5 text-[11px] text-aqua/80">
              {change.language}
            </span>
          )}
          <span className="shrink-0 text-xs text-white/40">
            <span className="text-emerald-300">+{added}</span>{' '}
            <span className="text-rose-300">−{removed}</span>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopyPatch}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:border-gold/40 hover:text-gold"
            aria-label={`Скопировать патч для ${change.path}`}
          >
            {patchCopied ? (
              <Check size={13} strokeWidth={2.4} aria-hidden="true" />
            ) : (
              <Copy size={13} strokeWidth={2} aria-hidden="true" />
            )}
            {patchCopied ? 'Скопировано!' : 'Скопировать патч'}
          </button>
          <button
            type="button"
            onClick={onCopyCode}
            className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            aria-label={`Скопировать код из ${change.path}`}
          >
            {codeCopied ? <Check size={13} strokeWidth={2.4} aria-hidden="true" /> : <Braces size={13} strokeWidth={2} aria-hidden="true" />}
            Код
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            className="flex items-center gap-1.5 rounded-full bg-gold px-3 py-1.5 text-xs font-semibold text-abyss transition enabled:hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-35"
            title={canApply ? 'Записать изменения в рабочую копию проекта в браузере' : 'Сначала добавь проект, чтобы применить патч'}
          >
            <Check size={13} strokeWidth={2.6} aria-hidden="true" />
            Применить
          </button>
        </div>
      </figcaption>

      {change.code && (
        <pre className="max-h-[440px] overflow-auto py-2 font-mono text-[12.5px] leading-[1.65]">
          <code>
            {rows.map((row, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <span key={index} className={`flex ${rowClass[row.type]}`} aria-hidden={row.type === 'del' ? undefined : undefined}>
                <span className="w-8 shrink-0 select-none pr-1 text-right text-white/20">
                  {gutterMark[row.type]}
                </span>
                <span className="whitespace-pre-wrap break-words pr-4">{row.text || ' '}</span>
              </span>
            ))}
          </code>
        </pre>
      )}

      {change.explanation && (
        <p className="border-t border-white/10 px-4 py-3 text-sm leading-relaxed text-white/60">
          {change.explanation}
        </p>
      )}
    </motion.figure>
  )
}

/* ── Экран ── */

export function VibeCodingPage() {
  const reducedMotion = useReducedMotion()
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [task, setTask] = useState('')
  const [mode, setMode] = useState<VibeMode>('generate')
  const [result, setResult] = useState<VibeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [folderBusy, setFolderBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const [githubInput, setGithubInput] = useState('')
  const [githubToken, setGithubToken] = useState(() => readGitHubToken())
  const [githubBusy, setGithubBusy] = useState(false)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const [appliedPaths, setAppliedPaths] = useState<Set<string>>(new Set())
  const copyTimer = useRef<number | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      const stored = await loadWorkspace()
      if (!active) return
      if (stored) {
        setWorkspace(stored)
        setSelected(defaultSelection(stored.files))
      }
      setLoaded(true)
    })()

    return () => {
      active = false
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  /* Магия размышления: пока рыбка думает, волны на фоне вспыхивают золотом. */
  useEffect(() => {
    const root = document.documentElement
    if (analyzing) root.dataset.thinking = 'true'
    else delete root.dataset.thinking

    return () => {
      delete root.dataset.thinking
    }
  }, [analyzing])

  const applyWorkspace = useCallback(async (next: Workspace, message: string): Promise<void> => {
    setWorkspace(next)
    setSelected(defaultSelection(next.files))
    setResult(null)
    setError(null)
    setNotice(message)
    setPanelOpen(true)
    setAppliedPaths(new Set())

    try {
      await saveWorkspace(next)
    } catch {
      setNotice(`${message} Но сохранить проект в браузере не удалось — после перезагрузки он пропадёт.`)
    }
  }, [])

  const openFolder = async (): Promise<void> => {
    if (folderBusy) return

    setFolderBusy(true)
    setError(null)
    setNotice(null)

    try {
      const next = await pickFolder()
      if (next === null) return

      if (next.files.length === 0) {
        setError(
          'В папке не нашлось подходящих текстовых файлов. Нужны исходники: .ts, .tsx, .py, .css и т. п.',
        )
        return
      }

      await applyWorkspace(
        next,
        `Папка загружена: ${next.files.length} файлов. Выбери нужные и опиши задачу.`,
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setFolderBusy(false)
    }
  }

  const loadDemo = async (): Promise<void> => {
    setError(null)
    await applyWorkspace(
      demoWorkspace(),
      'Демо-проект загружен — можно сразу попробовать вайбкодинг.',
    )
  }

  const forgetProject = async (): Promise<void> => {
    await clearWorkspace()
    setWorkspace(null)
    setSelected(new Set())
    setResult(null)
    setFilter('')
    setPanelOpen(false)
    setAppliedPaths(new Set())
    setNotice('Проект убран из браузера.')
    setError(null)
  }

  const submitGitHub = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (githubBusy) return

    setGithubBusy(true)
    setGithubError(null)

    try {
      const imported = await importGitHub(githubInput, githubToken.trim())
      saveGitHubToken(githubToken.trim())
      setGithubOpen(false)
      setGithubInput('')

      await applyWorkspace(
        imported.workspace,
        `Импортирован ${imported.repo.fullName} (${imported.repo.branch}): ${imported.workspace.files.length} файлов.`,
      )
    } catch (caught) {
      setGithubError(errorMessage(caught))
    } finally {
      setGithubBusy(false)
    }
  }

  const toggleFile = (path: string): void => {
    setSelected((previous) => {
      const next = new Set(previous)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const selectImportant = (): void => {
    if (workspace) setSelected(defaultSelection(workspace.files))
  }

  const clearSelection = (): void => setSelected(new Set())

  const analyze = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const text = task.trim()
    if (text.length < 3 || analyzing) return

    if (workspace && selected.size === 0) {
      setError('Выбери хотя бы один файл проекта — иначе рыбка не увидит код.')
      setPanelOpen(true)
      return
    }

    setAnalyzing(true)
    setError(null)
    setNotice(null)

    try {
      const response = await api.vibecoding.analyze({
        task: text,
        mode,
        source: workspace?.source ?? 'none',
        ...(workspace?.repo ? { repo: workspace.repo } : {}),
        files: workspace ? filesForServer(workspace.files, selected) : [],
      })
      setResult(response)
      setAppliedPaths(new Set())
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setAnalyzing(false)
    }
  }

  const markCopied = (key: string): void => {
    setCopied(key)
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(null), 2200)
  }

  const copyText = async (key: string, text: string, fallback: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      markCopied(key)
    } catch {
      setError(fallback)
    }
  }

  /** Записывает код изменения в рабочую копию проекта, которая живёт в браузере. */
  const applyChange = async (change: VibeChange): Promise<void> => {
    if (!workspace) return

    const existing = workspace.files.find((file) => file.path === change.path)
    const updatedFile: WorkspaceFile = {
      path: change.path,
      content: change.code,
      language: change.language ?? detectLanguage(change.path),
      size: new TextEncoder().encode(change.code).length,
    }

    const files = existing
      ? workspace.files.map((file) => (file.path === change.path ? updatedFile : file))
      : [...workspace.files, updatedFile]

    const next: Workspace = { ...workspace, files, updatedAt: new Date().toISOString() }

    setWorkspace(next)
    setAppliedPaths((previous) => new Set(previous).add(change.path))

    try {
      await saveWorkspace(next)
      setNotice(
        existing
          ? `Патч применён: ${change.path} обновлён в рабочей копии.`
          : `Патч применён: ${change.path} добавлен в рабочую копию.`,
      )
    } catch {
      setNotice('Патч применён в памяти, но сохранить в браузере не удалось.')
    }
  }

  const visibleFiles = useMemo(() => {
    if (!workspace) return []
    const query = filter.trim().toLowerCase()
    return query
      ? workspace.files.filter((file) => file.path.toLowerCase().includes(query))
      : workspace.files
  }, [workspace, filter])

  const totalSize = useMemo(
    () => (workspace ? workspace.files.reduce((sum, file) => sum + file.size, 0) : 0),
    [workspace],
  )

  const oldContentFor = useCallback(
    (path: string): string | null => workspace?.files.find((file) => file.path === path)?.content ?? null,
    [workspace],
  )

  /** Документ живого предпросмотра (Live Server) собирается из файлов проекта. */
  const preview = useMemo(() => buildPreviewDocument(workspace), [workspace])

  const openPreviewTab = (): void => {
    const url = preview.document ? previewBlobUrl(preview.document) : null
    if (url) window.open(url, '_blank', 'noopener')
  }

  /** Split view: когда есть изменения — экран делится на чат и окно кода. */
  const split = result !== null && result.changes.length > 0

  return (
    <section className="relative flex min-h-full flex-col" aria-labelledby="vibe-title">
      {/* Едва заметная золотая волна, пока рыбка думает */}
      <AnimatePresence>
        {analyzing && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-24 z-0 flex justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.6 }}
          >
            <div className="gold-pulse h-48 w-[140%] rounded-full bg-gold/15 blur-[100px]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Левая выезжающая панель «Файлы проекта» */}
      <AnimatePresence>
        {panelOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть панель файлов"
              className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => setPanelOpen(false)}
            />
            <motion.aside
              className="glass-strong fixed inset-y-0 left-0 z-40 flex w-[min(360px,92vw)] flex-col rounded-r-3xl shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 320, damping: 34 }
              }
              aria-label="Файлы проекта"
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-5">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <FolderOpen size={17} strokeWidth={1.9} className="text-gold" aria-hidden="true" />
                  Файлы проекта
                </h2>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                  aria-label="Закрыть"
                >
                  <X size={17} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-6">
                {workspace && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="truncate text-sm font-medium text-white/85">
                      {workspace.repo ?? 'Локальная папка'}
                      {workspace.branch && (
                        <span className="ml-2 text-xs font-normal text-aqua/80">{workspace.branch}</span>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/45">
                      {workspace.files.length} файлов · {formatBytes(totalSize)} · выбрано{' '}
                      {Math.min(selected.size, 60)} · {formatDate(workspace.updatedAt)}
                    </p>
                    {workspace.source !== 'github' && (
                      <span className="mt-2 inline-block rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/50">
                        {workspace.source === 'demo' ? 'демо' : 'папка'}
                      </span>
                    )}
                    {workspace.truncated && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-200/80">
                        <AlertTriangle size={13} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                        Проект большой: показана только часть файлов.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void openFolder()}
                    disabled={folderBusy}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 transition hover:border-gold/40 hover:text-gold disabled:opacity-50"
                  >
                    {folderBusy ? (
                      <Loader2 size={15} className="animate-spin" strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <FolderOpen size={15} strokeWidth={1.9} aria-hidden="true" />
                    )}
                    {folderBusy ? 'Читаю…' : 'Папка'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGithubOpen((value) => !value)
                      setGithubError(null)
                    }}
                    aria-expanded={githubOpen}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 transition hover:border-gold/40 hover:text-gold"
                  >
                    <Github size={15} strokeWidth={1.9} aria-hidden="true" />
                    GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadDemo()}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white/80 transition hover:border-aqua/40 hover:text-aqua"
                  >
                    <Sparkles size={15} strokeWidth={1.9} aria-hidden="true" />
                    Демо
                  </button>
                  {workspace && (
                    <button
                      type="button"
                      onClick={() => void forgetProject()}
                      title="Убрать проект из браузера"
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-300/20 px-3 py-2.5 text-sm text-rose-200/80 transition hover:border-rose-300/50"
                    >
                      <Trash2 size={14} strokeWidth={1.9} aria-hidden="true" />
                      Убрать
                    </button>
                  )}
                </div>

                {githubOpen && (
                  <form
                    className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                    onSubmit={submitGitHub}
                  >
                    <label className="flex flex-col gap-1.5" htmlFor="github-repo">
                      <span className="text-xs font-medium text-white/55">Репозиторий</span>
                      <input
                        id="github-repo"
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold/50"
                        value={githubInput}
                        onChange={(event) => setGithubInput(event.target.value)}
                        placeholder="владелец/репозиторий или ссылка"
                        autoComplete="off"
                        required
                      />
                    </label>
                    <label className="flex flex-col gap-1.5" htmlFor="github-token">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-white/55">
                        <KeyRound size={12} strokeWidth={2} aria-hidden="true" />
                        GitHub-токен <span className="text-white/30">для приватных</span>
                      </span>
                      <input
                        id="github-token"
                        className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-gold/50"
                        type="password"
                        value={githubToken}
                        onChange={(event) => setGithubToken(event.target.value)}
                        placeholder="ghp_… (необязательно)"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </label>
                    <p className="text-[11px] leading-relaxed text-white/35">
                      Токен хранится только в sessionStorage этой вкладки и не отправляется на наш
                      сервер. Публичные репозитории работают без токена.
                    </p>
                    {githubError && (
                      <p className="text-xs text-rose-300" role="alert">
                        {githubError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={githubBusy || !githubInput.trim()}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-sm font-semibold text-abyss transition enabled:hover:bg-gold-soft disabled:opacity-40"
                      >
                        {githubBusy ? (
                          <Loader2 size={14} className="animate-spin" strokeWidth={2} aria-hidden="true" />
                        ) : (
                          <Github size={14} strokeWidth={2} aria-hidden="true" />
                        )}
                        {githubBusy ? 'Импортирую…' : 'Импортировать'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGithubOpen(false)}
                        disabled={githubBusy}
                        className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60 transition hover:text-white disabled:opacity-40"
                      >
                        Отмена
                      </button>
                    </div>
                  </form>
                )}

                {workspace && (
                  <>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={selectImportant}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/5 hover:text-white"
                      >
                        <Wand2 size={13} strokeWidth={1.9} aria-hidden="true" />
                        Важные
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-white/60 transition hover:bg-white/5 hover:text-white"
                      >
                        <X size={13} strokeWidth={2} aria-hidden="true" />
                        Снять
                      </button>
                    </div>

                    <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                      <Search size={14} strokeWidth={2} className="shrink-0 text-white/35" aria-hidden="true" />
                      <span className="sr-only">Поиск по файлам</span>
                      <input
                        className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/25"
                        value={filter}
                        onChange={(event) => setFilter(event.target.value)}
                        placeholder="Найти файл…"
                        autoComplete="off"
                      />
                    </label>

                    <ul className="flex flex-col gap-0.5">
                      {visibleFiles.map((file) => {
                        const checked = selected.has(file.path)
                        return (
                          <li key={file.path}>
                            <label
                              className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                                checked
                                  ? 'border border-gold/30 bg-gold/10'
                                  : 'border border-transparent hover:bg-white/5'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="peer sr-only"
                                checked={checked}
                                onChange={() => toggleFile(file.path)}
                              />
                              <span
                                aria-hidden="true"
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                  checked ? 'border-gold bg-gold text-abyss' : 'border-white/25'
                                }`}
                              >
                                {checked && <Check size={10} strokeWidth={3.5} />}
                              </span>
                              <FileCode2
                                size={13}
                                strokeWidth={1.8}
                                className="shrink-0 text-aqua/70"
                                aria-hidden="true"
                              />
                              <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/75">
                                {file.path}
                              </span>
                              <span className="shrink-0 text-[10px] text-white/30">
                                {formatBytes(file.size)}
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>

                    {visibleFiles.length === 0 && (
                      <p className="py-4 text-center text-xs text-white/40">
                        Ничего не нашлось. Измени запрос.
                      </p>
                    )}
                    <p className="text-[11px] leading-relaxed text-white/30">
                      На анализ уйдут выбранные файлы: до 60 штук и в пределах разумного размера.
                    </p>
                  </>
                )}

                {!workspace && (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center">
                    <FolderOpen size={22} strokeWidth={1.6} className="text-white/30" aria-hidden="true" />
                    <p className="text-sm font-medium text-white/70">Проект ещё не добавлен</p>
                    <p className="text-xs leading-relaxed text-white/40">
                      Открой локальную папку, импортируй GitHub-репозиторий или начни с демо-проекта.
                    </p>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Живой предпросмотр проекта (Live Server): панель справа */}
      <AnimatePresence>
        {previewOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть предпросмотр"
              className="fixed inset-0 z-30 bg-black/55 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.2 }}
              onClick={() => setPreviewOpen(false)}
            />
            <motion.aside
              className="glass-strong fixed inset-y-0 right-0 z-40 flex w-[min(560px,94vw)] flex-col overflow-hidden rounded-l-3xl shadow-2xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 320, damping: 34 }
              }
              aria-label="Живой предпросмотр проекта"
            >
              <div className="flex items-center justify-between gap-2 px-5 pb-3 pt-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Monitor size={17} strokeWidth={1.9} className="text-aqua" aria-hidden="true" />
                  Живой предпросмотр
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewKey((key) => key + 1)}
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                    aria-label="Перезагрузить предпросмотр"
                    title="Перезагрузить"
                  >
                    <RotateCw size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={openPreviewTab}
                    disabled={!preview.document}
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-35"
                    aria-label="Открыть в новой вкладке"
                    title="Открыть в новой вкладке"
                  >
                    <ExternalLink size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(false)}
                    className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
                    aria-label="Закрыть"
                  >
                    <X size={17} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {preview.document ? (
                <iframe
                  key={previewKey}
                  title="Предпросмотр проекта"
                  srcDoc={preview.document}
                  sandbox="allow-scripts allow-forms allow-modals allow-popups"
                  className="min-h-0 w-full flex-1 border-0 bg-white"
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                  <Monitor size={26} strokeWidth={1.5} className="text-white/25" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-white/50">{preview.reason}</p>
                  {!workspace && (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewOpen(false)
                        setPanelOpen(true)
                      }}
                      className="mt-1 flex items-center gap-1.5 rounded-full border border-gold/35 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
                    >
                      <FolderOpen size={15} strokeWidth={1.9} aria-hidden="true" />
                      Добавить проект
                    </button>
                  )}
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Центральный холст: в одиночном режиме — узкий, в split view — широкий */}
      <div
        className={`mx-auto flex w-full flex-1 flex-col px-4 pb-10 pt-2 transition-[max-width] duration-700 ease-out sm:px-6 ${
          split ? 'max-w-[1480px]' : 'max-w-3xl'
        }`}
      >
        {/* Верхняя строка холста: файлы слева, режим справа */}
        <motion.div {...fadeUp(0)} className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/75 transition hover:border-gold/40 hover:text-gold"
              aria-haspopup="dialog"
              aria-expanded={panelOpen}
            >
              <FolderOpen size={15} strokeWidth={1.9} aria-hidden="true" />
              <span className="hidden sm:inline">Файлы проекта</span>
              {workspace && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
                  {Math.min(selected.size, 60)}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm text-white/75 transition hover:border-aqua/40 hover:text-aqua"
              aria-haspopup="dialog"
              aria-expanded={previewOpen}
            >
              <Monitor size={15} strokeWidth={1.9} aria-hidden="true" />
              <span className="hidden sm:inline">Превью</span>
            </button>
          </div>

          <div className="glass flex rounded-full p-1" role="group" aria-label="Режим работы">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                aria-pressed={mode === item.id}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition ${
                  mode === item.id
                    ? 'bg-gold/15 text-gold'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                {item.id === 'generate' ? (
                  <Braces size={13} strokeWidth={1.9} aria-hidden="true" />
                ) : (
                  <BookOpen size={13} strokeWidth={1.9} aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        <AnimatePresence mode="wait" initial={false}>
          {analyzing ? (
            /* Магия размышления: поле ввода уступает место волне */
            <motion.div
              key="thinking"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: reducedMotion ? 0 : 0.5, ease: EASE }}
              className="mt-10 sm:mt-14"
              role="status"
              aria-live="polite"
            >
              <div className="glass relative overflow-hidden rounded-[32px] px-6 py-14 text-center shadow-[0_30px_80px_-44px_rgba(0,0,0,1)]">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(65%_100%_at_50%_0%,rgba(255,215,0,0.14),transparent_72%)]"
                />
                <Waves size={30} strokeWidth={1.4} className="mx-auto text-gold" aria-hidden="true" />
                <p className="mt-4 font-display text-3xl font-semibold text-white sm:text-4xl">
                  Волна несёт ответ…
                </p>
                <ThinkingDots reduced={reducedMotion} />
                <p className="mt-4 text-sm text-white/40">
                  Рыбка перечитывает выбранные файлы и плещет хвостом.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="composer"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: reducedMotion ? 0 : 0.5, ease: EASE }}
            >
              {/* Заголовок */}
              <motion.div {...fadeUp(0.08)} className="mt-10 text-center sm:mt-14">
                <h1
                  id="vibe-title"
                  className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl"
                >
                  Чего изволите?
                </h1>
                <p className="mt-3 text-sm text-white/40 sm:text-base">
                  Опиши задачу — рыбка разберёт проект и предложит патч.
                </p>
              </motion.div>

              {/* Большое матовое поле ввода */}
              <motion.form {...fadeUp(0.16)} className="mt-8" onSubmit={analyze}>
                <div className="glass rounded-[28px] p-4 shadow-[0_30px_80px_-44px_rgba(0,0,0,1)] transition focus-within:border-gold/35 sm:p-5">
                  <label htmlFor="vibe-task" className="sr-only">
                    Опиши, что нужно изменить в проекте
                  </label>
                  <textarea
                    id="vibe-task"
                    value={task}
                    onChange={(event) => setTask(event.target.value.slice(0, MAX_TASK))}
                    maxLength={MAX_TASK}
                    rows={6}
                    placeholder="Опиши, что нужно изменить в проекте..."
                    className="w-full resize-none bg-transparent text-lg leading-relaxed text-white outline-none placeholder:text-white/30"
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-white/35">
                      {MODES.find((item) => item.id === mode)?.hint ?? ''}
                      <span className="ml-3 tabular-nums text-white/25">
                        {task.length}/{MAX_TASK}
                      </span>
                    </span>
                    <button
                      type="submit"
                      disabled={analyzing || task.trim().length < 3}
                      aria-label="Отправить"
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold text-abyss shadow-[0_0_30px_rgba(255,215,0,0.25)] transition enabled:hover:bg-gold-soft enabled:hover:shadow-[0_0_44px_rgba(255,215,0,0.4)] disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {analyzing ? (
                        <Loader2 size={20} className="animate-spin" strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <ArrowUp size={20} strokeWidth={2.4} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Уведомления */}
        <AnimatePresence>
          {(notice || error) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: reducedMotion ? 0 : 0.25 }}
              className={`mt-5 flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm ${
                error
                  ? 'border-rose-300/30 bg-rose-400/10 text-rose-100'
                  : 'border-gold/25 bg-gold/[0.07] text-amber-100'
              }`}
              role={error ? 'alert' : 'status'}
            >
              {error ? (
                <AlertCircle size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <Sparkles size={15} strokeWidth={2} className="mt-0.5 shrink-0 text-gold" aria-hidden="true" />
              )}
              <span className="flex-1 leading-relaxed">{error ?? notice}</span>
              <button
                type="button"
                onClick={() => (error ? setError(null) : setNotice(null))}
                className="shrink-0 rounded-full p-1 opacity-60 transition hover:opacity-100"
                aria-label="Закрыть уведомление"
              >
                <X size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Результат: split view — чат с рыбкой слева (40%), окно кода справа (60%) */}
        <div
          className={`mt-8 grid gap-8 ${
            split ? 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''
          }`}
        >
          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-white/40">
              <Loader2 size={16} className="animate-spin" strokeWidth={2} aria-hidden="true" />
              Проверяю рабочее пространство…
            </div>
          ) : result === null ? (
            !notice && !error ? (
              <motion.div {...fadeUp(0.24)} className="py-8 text-center">
                <p className="text-sm text-white/35">
                  Здесь появится решение: план, шаги и готовый патч в виде diff.
                </p>
              </motion.div>
            ) : null
          ) : (
            <>
              {/* Левая колонка (≈40%) — чат с рыбкой: план и объяснения */}
              <div className="flex min-w-0 flex-col gap-5">
              {/* Краткое резюме */}
              <motion.div {...fadeUp(0.05)} className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <span
                    className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                      result.provider === null
                        ? 'border-rose-300/30 text-rose-200'
                        : 'border-aqua/25 text-aqua/85'
                    }`}
                  >
                    {result.provider === null ? (
                      <AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />
                    ) : (
                      <Sparkles size={11} strokeWidth={2} aria-hidden="true" />
                    )}
                    {providerLabel(result.provider)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-white/50">
                    {result.mode === 'generate' ? 'генерация' : 'объяснение'}
                  </span>
                </div>

                <h2 className="mt-4 font-display text-2xl font-semibold text-white">
                  {result.mode === 'generate' ? 'План решения' : 'Разбор кода'}
                </h2>
                <p className="mx-auto mt-2 max-w-xl leading-relaxed text-white/65">{result.summary}</p>

                {result.relevantFiles.length > 0 && (
                  <ul className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {result.relevantFiles.map((path) => (
                      <li
                        key={path}
                        className="flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 font-mono text-[11px] text-white/55"
                      >
                        <FileCode2 size={11} strokeWidth={1.9} aria-hidden="true" />
                        {path}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>

              {result.warnings.length > 0 && (
                <motion.div
                  {...fadeUp(0.08)}
                  role="note"
                  className="flex items-start gap-2.5 rounded-2xl border border-amber-300/25 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-100/85"
                >
                  <AlertTriangle size={15} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <ul className="flex-1 space-y-1 leading-relaxed">
                    {result.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </motion.div>
              )}

              {/* Шаги */}
              {result.steps.length > 0 && (
                <motion.ol {...fadeUp(0.1)} className="flex flex-col gap-3">
                  {result.steps.map((step, index) => (
                    <li key={step.id} className="flex gap-3.5">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/30 font-display text-sm text-gold"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-medium text-white/90">{step.title}</h3>
                        {step.detail && <p className="mt-0.5 text-sm leading-relaxed text-white/55">{step.detail}</p>}
                        {step.files.length > 0 && (
                          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                            {step.files.map((path) => (
                              <li key={path} className="font-mono text-[11px] text-aqua/70">
                                {path}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </motion.ol>
              )}

                {result.provider === null && (
                  <motion.p
                    {...fadeUp(0.12)}
                    className="flex items-center justify-center gap-1.5 text-center text-xs text-white/35"
                  >
                    <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
                    Детерминированный разбор без LLM. Подключи ключ провайдера в <code>.env</code>, чтобы
                    получать точнее патчи.
                  </motion.p>
                )}
              </div>

              {/* Правая колонка (≈60%) — тёмное окно кода с unified diff */}
              {result.changes.length > 0 && (
                <motion.section
                  initial={{ opacity: 0, x: reducedMotion ? 0 : 44 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: reducedMotion ? 0 : 0.7, ease: EASE }}
                  className="flex min-w-0 flex-col self-start overflow-hidden rounded-3xl border border-white/10 bg-[#0d1117]/85 shadow-[0_36px_90px_-50px_rgba(0,0,0,1)] lg:sticky lg:top-4 lg:max-h-[calc(100dvh-140px)] lg:overflow-y-auto"
                  aria-label="Окно кода с изменениями"
                >
                  <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0d1117]/95 px-5 py-3 backdrop-blur">
                    <h2 className="flex items-center gap-2 text-sm font-semibold text-white/85">
                      <Braces size={15} strokeWidth={1.9} className="text-gold" aria-hidden="true" />
                      {result.mode === 'generate' ? 'Изменения' : 'Ключевые фрагменты'}
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-medium text-gold">
                        {result.changes.length}
                      </span>
                    </h2>
                    <span className="font-mono text-[11px] text-white/35">unified diff</span>
                  </div>

                  <div className="flex flex-col gap-4 p-4">
                    {result.changes.map((change) => (
                      <DiffBlock
                        key={`${change.path}-${change.code.slice(0, 24)}`}
                        change={change}
                        oldContent={oldContentFor(change.path)}
                        patchCopied={copied === `patch:${change.path}`}
                        codeCopied={copied === `code:${change.path}`}
                        canApply={workspace !== null && !appliedPaths.has(change.path)}
                        onCopyPatch={() => void copyText(
                          `patch:${change.path}`,
                          buildPatchText(change.path, diffLines(oldContentFor(change.path) ?? '', change.code)),
                          'Браузер не дал скопировать патч. Выдели его вручную.',
                        )}
                        onCopyCode={() => void copyText(
                          `code:${change.path}`,
                          change.code,
                          'Браузер не дал скопировать код. Выдели его вручную.',
                        )}
                        onApply={() => void applyChange(change)}
                      />
                    ))}
                  </div>
                </motion.section>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
