/**
 * Рабочее пространство вайбкодинга на стороне браузера.
 *
 * Сервер не читает диск и не ходит в GitHub за пользователя. Мы либо
 * открываем локальную папку через File System Access API, либо используем
 * `<input webkitdirectory>`, либо импортируем публичный репозиторий.
 * Выбранные файлы хранятся в IndexedDB и уходят на анализ только по кнопке.
 *
 * Токен GitHub (для приватных репозиториев) живёт только в sessionStorage
 * и никогда не отправляется на наш сервер.
 */

export type WorkspaceSource = 'folder' | 'github' | 'demo' | 'none'

export interface WorkspaceFile {
  path: string
  content: string
  language: string | null
  size: number
}

export interface Workspace {
  source: WorkspaceSource
  repo: string | null
  branch: string | null
  files: WorkspaceFile[]
  updatedAt: string
  truncated: boolean
}

export interface VibeProjectFilePayload {
  path: string
  content: string
  language: string | null
}

export const MAX_SERVER_FILES = 60
const MAX_WORKSPACE_FILES = 240
const MAX_FILE_CHARS = 120_000
const MAX_FILE_BYTES = 400_000
const MAX_WORKSPACE_CHARS = 2_400_000
const GITHUB_TOKEN_KEY = 'zr:github:token'

const SKIP_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.nuxt',
  '.cache',
  '.idea',
  '.vscode',
])

const SENSITIVE_NAMES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.npmrc',
  '.pypirc',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'credentials',
  'credentials.json',
  'secrets.json',
  'secret.json',
])

const SENSITIVE_SUFFIXES = ['.pem', '.key', '.p12', '.pfx', '.keystore', '.jks']

const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.json': 'json',
  '.md': 'markdown',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.sh': 'bash',
  '.ps1': 'powershell',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'kotlin',
  '.swift': 'swift',
  '.php': 'php',
  '.rb': 'ruby',
  '.vue': 'vue',
  '.svelte': 'svelte',
}

const EXTENSIONLESS_NAMES = new Set([
  'dockerfile',
  'makefile',
  'procfile',
  'gemfile',
  'rakefile',
  'license',
])

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceError'
  }
}

/* ── Проверки путей ─────────────────────────────────────────── */

function pathParts(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean)
}

export function isSensitivePath(path: string): boolean {
  const parts = pathParts(path).map((part) => part.toLowerCase())
  const name = parts[parts.length - 1] ?? ''

  if (parts.slice(0, -1).some((part) => SKIP_DIRS.has(part))) return true
  if (SENSITIVE_NAMES.has(name) || name.startsWith('.env')) return true
  if (SENSITIVE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true
  if (/(secret|password|credential)/.test(name)) return true
  return false
}

function hasAllowedName(path: string): boolean {
  const name = (pathParts(path).pop() ?? '').toLowerCase()
  if (EXTENSIONLESS_NAMES.has(name)) return true
  if (name.startsWith('readme')) return true
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return name.slice(dot) in LANGUAGE_BY_EXT
}

function isLikelyText(text: string): boolean {
  return !text.slice(0, 2000).includes('\u0000')
}

export function detectLanguage(path: string): string | null {
  const name = (pathParts(path).pop() ?? '').toLowerCase()
  if (name === 'dockerfile') return 'dockerfile'
  if (name === 'makefile') return 'makefile'
  const dot = name.lastIndexOf('.')
  return dot === -1 ? null : LANGUAGE_BY_EXT[name.slice(dot)] ?? null
}

/* ── IndexedDB ──────────────────────────────────────────────── */

const DB_NAME = 'zr-vibecoding'
const DB_VERSION = 1
const STORE = 'workspace'
const KEY = 'current'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new WorkspaceError('Браузер не поддерживает IndexedDB'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new WorkspaceError('IndexedDB недоступен'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase()

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = run(transaction.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new WorkspaceError('Ошибка IndexedDB'))
    })
  } finally {
    db.close()
  }
}

function isWorkspaceFile(value: unknown): value is WorkspaceFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Record<string, unknown>
  return (
    typeof file.path === 'string' &&
    typeof file.content === 'string' &&
    typeof file.size === 'number' &&
    (typeof file.language === 'string' || file.language === null)
  )
}

function isWorkspace(value: unknown): value is Workspace {
  if (typeof value !== 'object' || value === null) return false
  const workspace = value as Record<string, unknown>
  return (
    Array.isArray(workspace.files) &&
    workspace.files.every(isWorkspaceFile) &&
    typeof workspace.updatedAt === 'string'
  )
}

export async function loadWorkspace(): Promise<Workspace | null> {
  try {
    const raw = await withStore<unknown>('readonly', (store) => store.get(KEY))
    return isWorkspace(raw) ? raw : null
  } catch {
    return null
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  await withStore('readwrite', (store) => store.put(workspace, KEY))
}

export async function clearWorkspace(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY))
  } catch {
    // Проект остался только в памяти — это не критично.
  }
}

/* ── GitHub-токен ───────────────────────────────────────────── */

export function readGitHubToken(): string {
  try {
    return window.sessionStorage.getItem(GITHUB_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function saveGitHubToken(token: string): void {
  try {
    if (token) window.sessionStorage.setItem(GITHUB_TOKEN_KEY, token)
    else window.sessionStorage.removeItem(GITHUB_TOKEN_KEY)
  } catch {
    // sessionStorage может быть недоступен — тогда работают только публичные репозитории.
  }
}

/* ── Сбор файлов ────────────────────────────────────────────── */

interface ReadState {
  files: WorkspaceFile[]
  chars: number
  truncated: boolean
  skipped: number
}

async function readTextFile(path: string, file: File, state: ReadState): Promise<void> {
  if (state.files.length >= MAX_WORKSPACE_FILES) {
    state.truncated = true
    return
  }
  if (file.size > MAX_FILE_BYTES) {
    state.skipped += 1
    return
  }

  const text = await file.text()
  if (!isLikelyText(text)) {
    state.skipped += 1
    return
  }

  const content = text.slice(0, MAX_FILE_CHARS)
  if (state.chars + content.length > MAX_WORKSPACE_CHARS) {
    state.truncated = true
    return
  }

  state.chars += content.length
  state.files.push({
    path,
    content,
    language: detectLanguage(path),
    size: file.size,
  })
}

function finishWorkspace(
  source: WorkspaceSource,
  repo: string | null,
  branch: string | null,
  state: ReadState,
): Workspace {
  return {
    source,
    repo,
    branch,
    files: state.files.sort((a, b) => a.path.localeCompare(b.path)),
    updatedAt: new Date().toISOString(),
    truncated: state.truncated,
  }
}

/* ── Локальная папка: File System Access API ────────────────── */

interface PickerFileHandle {
  kind: 'file'
  name: string
  getFile: () => Promise<File>
}

interface PickerDirectoryHandle {
  kind: 'directory'
  name: string
  values: () => AsyncIterableIterator<PickerFileHandle | PickerDirectoryHandle>
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<PickerDirectoryHandle>
}

async function walkDirectory(
  handle: PickerDirectoryHandle,
  prefix: string,
  state: ReadState,
): Promise<void> {
  for await (const entry of handle.values()) {
    if (state.files.length >= MAX_WORKSPACE_FILES) {
      state.truncated = true
      return
    }

    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.kind === 'directory') {
      if (SKIP_DIRS.has(entry.name.toLowerCase())) continue
      await walkDirectory(entry, path, state)
      continue
    }

    if (!hasAllowedName(path) || isSensitivePath(path)) continue

    try {
      const file = await entry.getFile()
      await readTextFile(path, file, state)
    } catch {
      state.skipped += 1
    }
  }
}

function pickWithDirectoryApi(): Promise<Workspace | null> | null {
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker
  if (typeof picker !== 'function') return null

  return (async () => {
    let handle: PickerDirectoryHandle
    try {
      handle = await picker({ mode: 'read' })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return null
      throw new WorkspaceError('Не удалось открыть папку. Попробуй выбрать её ещё раз.')
    }

    const state: ReadState = { files: [], chars: 0, truncated: false, skipped: 0 }
    await walkDirectory(handle, '', state)
    return finishWorkspace('folder', null, null, state)
  })()
}

function pickWithInput(): Promise<Workspace | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    const extended = input as HTMLInputElement & { webkitdirectory: boolean }
    extended.type = 'file'
    extended.webkitdirectory = true
    extended.multiple = true
    input.hidden = true
    document.body.appendChild(input)

    let settled = false

    const cleanup = (): void => {
      input.remove()
    }

    input.addEventListener('change', () => {
      if (settled) return
      settled = true
      const selected = Array.from(input.files ?? [])
      cleanup()

      if (selected.length === 0) {
        resolve(null)
        return
      }

      void (async () => {
        const state: ReadState = { files: [], chars: 0, truncated: false, skipped: 0 }

        for (const file of selected) {
          if (state.files.length >= MAX_WORKSPACE_FILES) {
            state.truncated = true
            break
          }

          const relative = file.webkitRelativePath || file.name
          const parts = pathParts(relative)
          // Первый сегмент — сама выбранная папка; путь делаем относительным.
          const path = parts.slice(1).join('/') || file.name

          if (!path || !hasAllowedName(path) || isSensitivePath(path)) continue

          try {
            await readTextFile(path, file, state)
          } catch {
            state.skipped += 1
          }
        }

        resolve(finishWorkspace('folder', null, null, state))
      })().catch(reject)
    })

    input.addEventListener('cancel', () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(null)
    })

    input.click()
  })
}

/** Открывает папку проекта. Возвращает null, если пользователь отменил выбор. */
export async function pickFolder(): Promise<Workspace | null> {
  const modern = pickWithDirectoryApi()
  return modern ?? pickWithInput()
}

/* ── GitHub ─────────────────────────────────────────────────── */

interface GitHubRepoInfo {
  full_name?: string
  default_branch?: string
  html_url?: string
  private?: boolean
}

interface GitHubTreeItem {
  path?: string
  type?: string
  size?: number
}

interface GitHubTreeResponse {
  tree?: GitHubTreeItem[]
  truncated?: boolean
}

function githubHeaders(token: string, raw = false): HeadersInit {
  const headers: Record<string, string> = {
    Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

export function parseRepoInput(raw: string): { owner: string; repo: string } {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')

  const [owner, repo, ...rest] = cleaned.split('/')
  const valid = (part: string): boolean => /^[A-Za-z0-9_.-]{1,100}$/.test(part)

  if (!owner || !repo || rest.length > 0 || !valid(owner) || !valid(repo)) {
    throw new WorkspaceError('Укажи репозиторий в формате «владелец/название» или ссылкой GitHub.')
  }

  return { owner, repo }
}

async function githubError(response: Response): Promise<WorkspaceError> {
  if (response.status === 404) {
    return new WorkspaceError(
      'Репозиторий не найден или приватный. Для приватных добавь GitHub-токен.',
    )
  }
  if (response.status === 403 || response.status === 429) {
    return new WorkspaceError(
      'GitHub временно ограничил запросы. Подожди немного или добавь токен.',
    )
  }
  return new WorkspaceError(`GitHub ответил ошибкой ${response.status}.`)
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const result: R[] = new Array(items.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) return
      result[index] = await run(item)
    }
  })

  await Promise.all(workers)
  return result
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

export interface GitHubImportResult {
  workspace: Workspace
  repo: { fullName: string; branch: string; url: string; private: boolean }
}

export async function importGitHub(raw: string, token = ''): Promise<GitHubImportResult> {
  const { owner, repo } = parseRepoInput(raw)

  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubHeaders(token),
  })
  if (!repoResponse.ok) throw await githubError(repoResponse)

  const info = (await repoResponse.json()) as GitHubRepoInfo
  const branch = info.default_branch ?? 'main'
  const fullName = info.full_name ?? `${owner}/${repo}`

  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: githubHeaders(token) },
  )
  if (!treeResponse.ok) throw await githubError(treeResponse)

  const tree = (await treeResponse.json()) as GitHubTreeResponse
  const candidates = (tree.tree ?? [])
    .filter(
      (item) =>
        item.type === 'blob' &&
        typeof item.path === 'string' &&
        hasAllowedName(item.path) &&
        !isSensitivePath(item.path) &&
        (item.size ?? 0) <= MAX_FILE_BYTES,
    )
    .map((item) => item.path as string)
    .sort((a, b) => a.localeCompare(b))

  const limited = candidates.slice(0, MAX_WORKSPACE_FILES)
  const state: ReadState = {
    files: [],
    chars: 0,
    truncated: Boolean(tree.truncated) || limited.length < candidates.length,
    skipped: 0,
  }

  const contents = await mapLimit(limited, 4, async (path) => {
    const url = token
      ? `https://api.github.com/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`
      : `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodePath(path)}`

    const headers: HeadersInit = token
      ? githubHeaders(token, true)
      : { Accept: 'text/plain' }

    try {
      const response = await fetch(url, { headers })
      if (!response.ok) return null

      const text = await response.text()
      if (!isLikelyText(text)) return null
      const content = text.slice(0, MAX_FILE_CHARS)
      if (state.chars + content.length > MAX_WORKSPACE_CHARS) {
        state.truncated = true
        return null
      }
      state.chars += content.length

      return {
        path,
        content,
        language: detectLanguage(path),
        size: text.length,
      } satisfies WorkspaceFile
    } catch {
      state.skipped += 1
      return null
    }
  })

  state.files = contents.filter((file): file is WorkspaceFile => file !== null)
  const workspace = finishWorkspace('github', fullName, branch, state)

  return {
    workspace,
    repo: {
      fullName,
      branch,
      url: info.html_url ?? `https://github.com/${fullName}`,
      private: Boolean(info.private),
    },
  }
}

/* ── Демо-проект ────────────────────────────────────────────── */

const DEMO_FILES: Array<{ path: string; content: string }> = [
  {
    path: 'README.md',
    content:
      '# Демо-проект «Список задач»\n\nМини-приложение на React: добавляет задачи, отмечает выполненные и хранит их в localStorage.\n',
  },
  {
    path: 'src/App.tsx',
    content: `import { useState } from 'react'
import { TaskList } from './components/TaskList'
import { addTask, type Task } from './tasks'

export function App() {
  const [tasks, setTasks] = useState<Task[]>([])

  return (
    <main className="app">
      <h1>Мои задачи</h1>
      <button type="button" onClick={() => setTasks((items) => addTask(items, 'Новая задача'))}>
        Добавить задачу
      </button>
      <TaskList tasks={tasks} onToggle={() => undefined} />
    </main>
  )
}
`,
  },
  {
    path: 'src/tasks.ts',
    content: `export interface Task {
  id: string
  title: string
  done: boolean
}

export function addTask(tasks: Task[], title: string): Task[] {
  if (!title.trim()) return tasks
  return [...tasks, { id: crypto.randomUUID(), title: title.trim(), done: false }]
}

export function toggleTask(tasks: Task[], id: string): Task[] {
  return tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task))
}
`,
  },
  {
    path: 'src/components/TaskList.tsx',
    content: `import type { Task } from '../tasks'

interface TaskListProps {
  tasks: Task[]
  onToggle: (id: string) => void
}

export function TaskList({ tasks, onToggle }: TaskListProps) {
  if (tasks.length === 0) return <p>Пока нет задач</p>

  return (
    <ul>
      {tasks.map((task) => (
        <li key={task.id}>
          <label>
            <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
            {task.title}
          </label>
        </li>
      ))}
    </ul>
  )
}
`,
  },
  {
    path: 'src/styles/app.css',
    content: `.app {
  display: grid;
  gap: 16px;
  max-width: 640px;
  margin: 40px auto;
  padding: 24px;
  border-radius: 16px;
  background: #0a1634;
  color: #f7f3e8;
}

button {
  padding: 10px 14px;
  border-radius: 10px;
}
`,
  },
]

export function demoWorkspace(): Workspace {
  const state: ReadState = { files: [], chars: 0, truncated: false, skipped: 0 }
  for (const file of DEMO_FILES) {
    state.files.push({
      path: file.path,
      content: file.content,
      language: detectLanguage(file.path),
      size: file.content.length,
    })
    state.chars += file.content.length
  }
  return finishWorkspace('demo', null, null, state)
}

/* ── Отправка на анализ ─────────────────────────────────────── */

export function filesForServer(
  files: readonly WorkspaceFile[],
  selected: ReadonlySet<string>,
): VibeProjectFilePayload[] {
  const limit = 180_000
  const payload: VibeProjectFilePayload[] = []
  let chars = 0

  for (const file of files) {
    if (payload.length >= MAX_SERVER_FILES) break
    if (!selected.has(file.path)) continue

    const content = file.content.slice(0, MAX_FILE_CHARS)
    if (payload.length > 0 && chars + content.length > limit) continue

    chars += content.length
    payload.push({ path: file.path, content, language: file.language })
  }

  return payload
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} Б`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`
  return `${(value / (1024 * 1024)).toFixed(1)} МБ`
}
