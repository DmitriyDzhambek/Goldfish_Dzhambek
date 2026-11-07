/**
 * Студия идей — «Рыбка-архитектор».
 *
 * Сценарий пользователя:
 *   1. Пустой экран: одна большая строка ввода и ничего больше.
 *   2. Пользователь описывает идею и нажимает «Отправить» —
 *      поле плавно сворачивается, на его месте «Волна несёт ответ…»,
 *      фон пульсирует золотом.
 *   3. Ответ приходит тремя волнами (Видение → Стек → Код),
 *      текст печатается в реальном времени, код стримится в окно справа.
 *   4. Экран делится: слева чат (40%), справа код (60%).
 *   5. Рыбка спрашивает «Чего изволите дальше?» — диалог продолжается
 *      с памятью о первой идее.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  ArrowUp,
  BookOpen,
  Code2,
  Eye,
  ExternalLink,
  EyeOff,
  FolderOpen,
  Layers,
  Pin,
  Plus,
  Sparkles,
} from 'lucide-react'
import { getGuestId } from '../../lib/guest'
import {
  buildVaultEntry,
  clearVault,
  loadVault,
  removeVaultEntry,
  saveVaultEntry,
  type VaultEntry,
} from '../../idea/vault'
import { ProjectVault } from '../vault/ProjectVault'
import {
  buildExplainScript,
  buildFollowupScript,
  buildIdeaScript,
  sleep,
  streamCode,
  streamText,
  topicFromIdea,
  uid,
  type IdeaContext,
  type IdeaMessage,
  type IdeaScript,
  type IdeaSuggestion,
  type StreamSignal,
} from '../../idea/ideaEngine'
import { recommendedFilePaths } from '../../idea/mockRepo'
import { saveSession, type IdeaSession } from '../../idea/sessions'
import { CodeDiffViewer } from './CodeDiffViewer'
import { FileDrawer } from './FileDrawer'
import { VoiceInput } from './VoiceInput'
import styles from './IdeaWorkspace.module.css'

interface IdeaWorkspaceProps {
  /** Сессия, выбранная на вкладке «История» — восстанавливаем диалог. */
  resumeSession?: IdeaSession | null
  onResumeConsumed?: () => void
  /** Текст идеи, перенесённой из Дневника: попадает в поле ввода. */
  seedText?: string | null
  onSeedConsumed?: () => void
}

const EASE = [0.22, 0.61, 0.36, 1] as const

const EXAMPLE_IDEAS = [
  'Создать ВПН с шагомером',
  'Приложение для привычек с одной кнопкой',
  'Трекер книг с золотой полкой',
]

const STAGE_META: Record<string, { label: string; icon: typeof Eye }> = {
  vision: { label: 'Видение', icon: Eye },
  stack: { label: 'Стек', icon: Layers },
  code: { label: 'Код', icon: Code2 },
}

function userMessage(text: string, kind: IdeaMessage['kind']): IdeaMessage {
  return { id: uid('m'), role: 'user', kind, stage: null, text, artifact: null }
}

function emptyAssistant(kind: IdeaMessage['kind'], stage: IdeaMessage['stage']): IdeaMessage {
  return { id: uid('m'), role: 'assistant', kind, stage, text: '', artifact: null }
}

export function IdeaWorkspace({ resumeSession, onResumeConsumed, seedText, onSeedConsumed }: IdeaWorkspaceProps) {
  const reducedMotion = useReducedMotion()
  const userId = getGuestId()

  const [messages, setMessages] = useState<IdeaMessage[]>([])
  const [thinking, setThinking] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<IdeaSuggestion[] | null>(null)

  const [topic, setTopic] = useState<string | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [codeView, setCodeView] = useState<'code' | 'preview'>('code')

  const [filesOpen, setFilesOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<ReadonlySet<string>>(() => recommendedFilePaths())

  const [vaultOpen, setVaultOpen] = useState(false)
  const [vaultEntries, setVaultEntries] = useState<VaultEntry[]>([])
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => new Set())

  const cancelRef = useRef<StreamSignal>({ cancelled: false })
  const previousCodeRef = useRef<Record<string, string>>({})
  const firstIdeaRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const busy = thinking || streamingId !== null
  const chatMode = messages.length > 0 || thinking
  const activeArtifact = useMemo(
    () => messages.find((m) => m.artifact?.id === activeArtifactId)?.artifact ?? null,
    [messages, activeArtifactId],
  )
  const activeMessage = useMemo(
    () => messages.find((m) => m.artifact?.id === activeArtifactId) ?? null,
    [messages, activeArtifactId],
  )
  const previousCode = useMemo(() => {
    if (!activeArtifact) return null
    const prev = previousCodeRef.current[activeArtifact.fileName]
    return typeof prev === 'string' && prev !== activeArtifact.code ? prev : null
  }, [activeArtifact])

  /* ── Дневник идей: загрузка сохранённого ── */

  useEffect(() => {
    setVaultEntries(loadVault(userId))
  }, [userId])

  /* ── План для дневника: тексты Рыбки от прошлого артефакта до этого ── */

  const collectPlan = useCallback(
    (artifactMessageId: string): string => {
      const idx = messages.findIndex((message) => message.id === artifactMessageId)
      if (idx === -1) return ''
      const parts: string[] = []
      for (let i = idx - 1; i >= 0; i -= 1) {
        const message = messages[i]
        if (!message) break
        // План заканчивается на запросе пользователя или предыдущем артефакте.
        if (message.role === 'user' || message.artifact !== null) break
        if (message.text.trim().length > 0) parts.unshift(message.text.trim())
      }
      return parts.join('\n\n')
    },
    [messages],
  )

  /* ── Сохранение в Дневник ── */

  const pinToVault = useCallback(
    (message: IdeaMessage) => {
      if (!message.artifact || pinnedIds.has(message.id)) return
      const entry = buildVaultEntry({
        title: topic ? `${topic} · ${message.artifact.fileName}` : message.artifact.fileName,
        plan: collectPlan(message.id),
        code: message.artifact.code,
        fileName: message.artifact.fileName,
        language: message.artifact.language,
      })
      saveVaultEntry(userId, entry)
      setVaultEntries(loadVault(userId))
      setPinnedIds((prev) => new Set(prev).add(message.id))
    },
    [collectPlan, pinnedIds, topic, userId],
  )

  const removeFromVault = useCallback(
    (id: string) => {
      removeVaultEntry(userId, id)
      setVaultEntries(loadVault(userId))
    },
    [userId],
  )

  const wipeVault = useCallback(() => {
    clearVault(userId)
    setVaultEntries([])
  }, [userId])

  /* ── Автопрокрутка чата ── */

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTo({ top: node.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [messages, thinking, reducedMotion])

  /* ── Сохранение сессии в историю ── */

  useEffect(() => {
    if (messages.length === 0 || thinking || streamingId !== null) return
    const firstUser = messages.find((m) => m.role === 'user')
    const sessionTopic = topic ?? (firstUser ? topicFromIdea(firstUser.text) : 'Идея')
    if (!sessionIdRef.current) sessionIdRef.current = uid('session')
    saveSession({
      id: sessionIdRef.current,
      topic: sessionTopic,
      updatedAt: new Date().toISOString(),
      messages,
    })
  }, [messages, thinking, streamingId, topic])

  /* ── Восстановление сессии из «Истории» ── */

  useEffect(() => {
    if (!resumeSession) return
    cancelRef.current.cancelled = true
    cancelRef.current = { cancelled: false }
    setMessages(resumeSession.messages)
    setTopic(resumeSession.topic)
    sessionIdRef.current = resumeSession.id
    const lastArtifact = [...resumeSession.messages].reverse().find((m) => m.artifact)?.artifact ?? null
    setActiveArtifactId(lastArtifact?.id ?? null)
    setPanelOpen(lastArtifact !== null)
    setCodeView('code')
    setThinking(false)
    setStreamingId(null)
    for (const message of resumeSession.messages) {
      if (message.artifact) previousCodeRef.current[message.artifact.fileName] = message.artifact.code
    }
    onResumeConsumed?.()
  }, [resumeSession, onResumeConsumed])

  /* ── Идея из Дневника: предзаполняем ввод, отправит сам пользователь ── */

  useEffect(() => {
    if (!seedText) return
    cancelRef.current.cancelled = true
    cancelRef.current = { cancelled: false }
    setThinking(false)
    setStreamingId(null)
    setInput(seedText)
    onSeedConsumed?.()
  }, [seedText, onSeedConsumed])

  /* ── Проигрывание сценария ответа ── */

  const runScript = useCallback(
    async (script: IdeaScript, kind: IdeaMessage['kind'], signal: StreamSignal) => {
      for (const segment of script.segments) {
        if (signal.cancelled) return

        if (segment.type === 'text') {
          const message = emptyAssistant(kind, segment.stage)
          setStreamingId(message.id)
          setMessages((prev) => [...prev, message])
          await streamText(
            segment.text,
            (chunk) => {
              setMessages((prev) =>
                prev.map((item) => (item.id === message.id ? { ...item, text: item.text + chunk } : item)),
              )
            },
            signal,
          )
          setStreamingId(null)
        } else {
          const artifact = segment.artifact
          const message = emptyAssistant(kind, 'code')
          setStreamingId(message.id)
          setMessages((prev) => [...prev, { ...message, artifact: { ...artifact, code: '' } }])
          setActiveArtifactId(artifact.id)
          setPanelOpen(true)
          setCodeView('code')
          await streamCode(
            artifact.code,
            (chunk) => {
              setMessages((prev) =>
                prev.map((item) =>
                  item.id === message.id && item.artifact
                    ? { ...item, artifact: { ...item.artifact, code: item.artifact.code + chunk } }
                    : item,
                ),
              )
            },
            signal,
          )
          previousCodeRef.current[artifact.fileName] = artifact.code
          setStreamingId(null)
        }
      }

      if (!signal.cancelled) setSuggestions(script.suggestions)
    },
    [],
  )

  /* ── Отправка идеи / продолжение диалога ── */

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (text.length === 0 || busy) return

      cancelRef.current.cancelled = true
      const signal: StreamSignal = { cancelled: false }
      cancelRef.current = signal

      const first = firstIdeaRef.current === null
      if (first) {
        firstIdeaRef.current = text
        setTopic(topicFromIdea(text))
      }

      setInput('')
      setSuggestions(null)
      setMessages((prev) => [...prev, userMessage(text, first ? 'idea' : 'followup')])
      setThinking(true)
      await sleep(reducedMotion ? 250 : 1250, signal)
      if (signal.cancelled) return
      setThinking(false)

      const idea = firstIdeaRef.current ?? text
      const ctx: IdeaContext = {
        idea,
        topic: topicFromIdea(idea),
        turns: messages.length,
        lastArtifact:
          [...messages].reverse().find((m) => m.artifact)?.artifact ?? null,
      }
      const script = first ? buildIdeaScript(text) : buildFollowupScript(text, ctx)
      await runScript(script, first ? 'idea' : 'followup', signal)
    },
    [busy, messages, reducedMotion, runScript],
  )

  /* ── «Объяснить» — работает как реплика в диалоге ── */

  const explain = useCallback(async () => {
    if (!activeArtifact || busy) return
    cancelRef.current.cancelled = true
    const signal: StreamSignal = { cancelled: false }
    cancelRef.current = signal

    setSuggestions(null)
    setMessages((prev) => [...prev, userMessage('Объясни, как это устроено', 'followup')])
    setThinking(true)
    await sleep(reducedMotion ? 200 : 800, signal)
    if (signal.cancelled) return
    setThinking(false)
    await runScript(buildExplainScript(activeArtifact), 'explanation', signal)
  }, [activeArtifact, busy, reducedMotion, runScript])

  /* ── Новая идея: полный сброс ── */

  const reset = useCallback(() => {
    cancelRef.current.cancelled = true
    cancelRef.current = { cancelled: false }
    setMessages([])
    setThinking(false)
    setStreamingId(null)
    setSuggestions(null)
    setTopic(null)
    sessionIdRef.current = null
    firstIdeaRef.current = null
    setActiveArtifactId(null)
    setPanelOpen(false)
    setInput('')
    setPinnedIds(new Set())
  }, [])

  function toggleFile(path: string): void {
    setSelectedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function handleVoiceTranscript(text: string): void {
    setInput((prev) => (prev.length > 0 ? `${prev.trimEnd()} ${text}` : text))
  }

  const composer = (
    <form
      className={[styles.composer, chatMode ? styles.composerCompact : styles.composerHero].filter(Boolean).join(' ')}
      onSubmit={(event) => {
        event.preventDefault()
        void send(input)
      }}
    >
      <textarea
        className={styles.input}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void send(input)
          }
        }}
        placeholder={chatMode ? 'Чего изволите дальше?' : 'Опиши идею: «Создать ВПН с шагомером»…'}
        rows={chatMode ? 1 : 3}
        aria-label="Опиши идею"
      />
      <div className={styles.composerRow}>
        <VoiceInput onTranscript={handleVoiceTranscript} disabled={busy} />
        <button
          type="submit"
          className={styles.send}
          disabled={input.trim().length === 0 || busy}
          aria-label="Отправить"
        >
          <ArrowUp size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </form>
  )

  return (
    <div className={styles.workspace}>
      {/* Золотая пульсация фона, пока Рыбка думает */}
      <AnimatePresence>
        {thinking && (
          <motion.div
            className={styles.goldAura}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            aria-hidden="true"
          >
            <span className={styles.auraWave} />
            <span className={[styles.auraWave, styles.auraWaveSlow].filter(Boolean).join(' ')} />
          </motion.div>
        )}
      </AnimatePresence>

      {chatMode && (
        <motion.header
          className={styles.topbar}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <button type="button" className={styles.topBtn} onClick={() => setFilesOpen(true)}>
            <FolderOpen size={15} strokeWidth={1.8} aria-hidden="true" />
            Файлы проекта ({selectedFiles.size})
          </button>
          <span className={styles.topic} title={topic ?? undefined}>
            <Sparkles size={13} strokeWidth={1.8} aria-hidden="true" />
            {topic ?? 'Новая идея'}
          </span>
          <div className={styles.topGroup}>
            <button
              type="button"
              className={styles.topBtn}
              onClick={() => setVaultOpen(true)}
              aria-label="Открыть дневник идей"
            >
              <BookOpen size={15} strokeWidth={1.8} aria-hidden="true" />
              Дневник
            </button>
            <button type="button" className={styles.topBtn} onClick={reset}>
              <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
              Новая идея
            </button>
          </div>
        </motion.header>
      )}

      <div className={[styles.split, panelOpen && styles.splitOpen].filter(Boolean).join(' ')}>
        {/* ── Левая часть: чат ── */}
        <section className={styles.chatPane}>
          {chatMode ? (
            <div className={styles.messages} ref={scrollRef}>
              {messages.map((message) => {
                const stageMeta = message.stage !== null ? STAGE_META[message.stage] : undefined
                const StageIcon = stageMeta?.icon

                return (
                  <motion.article
                    key={message.id}
                    className={[
                      styles.message,
                      message.role === 'user' ? styles.user : styles.assistant,
                    ].filter(Boolean).join(' ')}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: EASE }}
                  >
                    {stageMeta && StageIcon && (
                      <span className={styles.stage}>
                        <StageIcon size={12} strokeWidth={1.9} aria-hidden="true" />
                        {stageMeta.label}
                      </span>
                    )}
                    <p className={styles.text}>{message.text}</p>
                    {message.id === streamingId && <span className={styles.caret} aria-hidden="true" />}
                    {message.artifact && message.id !== streamingId && (
                      <div className={styles.artifactRow}>
                        <button
                          type="button"
                          className={styles.artifactChip}
                          onClick={() => {
                            setActiveArtifactId(message.artifact!.id)
                            setPanelOpen(true)
                            setCodeView('code')
                          }}
                        >
                          <Code2 size={13} strokeWidth={1.8} aria-hidden="true" />
                          {message.artifact.fileName}
                        </button>
                        <button
                          type="button"
                          className={[
                            styles.pinBtn,
                            pinnedIds.has(message.id) && styles.pinBtnSaved,
                          ].filter(Boolean).join(' ')}
                          onClick={() => pinToVault(message)}
                          title="Сохранить план и код в Дневник идей"
                        >
                          <Pin size={12} strokeWidth={1.9} aria-hidden="true" />
                          {pinnedIds.has(message.id) ? 'В дневнике' : 'Сохранить в Дневник'}
                        </button>
                      </div>
                    )}
                  </motion.article>
                )
              })}

              {thinking && (
                <motion.div
                  className={styles.thinkingBubble}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <span className={styles.thinkingText}>Волна несёт ответ</span>
                  <span className={styles.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </motion.div>
              )}

              {!thinking && streamingId === null && suggestions !== null && suggestions.length > 0 && (
                <motion.div
                  className={styles.suggestions}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: EASE }}
                >
                  <span className={styles.suggestionsLabel}>Чего изволите дальше?</span>
                  <div className={styles.suggestionRow}>
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion.label}
                        type="button"
                        className={styles.suggestion}
                        onClick={() => void send(suggestion.label)}
                      >
                        {suggestion.label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          ) : (
            <div className={styles.hero}>
              <motion.h1
                className={styles.heroTitle}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              >
                Расскажи идею.
                <br />
                <span className={styles.heroGold}>Остальное — моя забота.</span>
              </motion.h1>
              <motion.p
                className={styles.heroSubtitle}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.12, ease: EASE }}
              >
                Видение, архитектура и первый экран с кодом — за один диалог.
              </motion.p>
              <motion.div
                className={styles.examples}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.24, ease: EASE }}
              >
                {EXAMPLE_IDEAS.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className={styles.example}
                    onClick={() => void send(example)}
                  >
                    {example}
                  </button>
                ))}
              </motion.div>
            </div>
          )}

          {/* Нижний слот: композер ↔ «Волна несёт ответ…» */}
          <div className={styles.bottomSlot}>
            <AnimatePresence mode="wait" initial={false}>
              {thinking ? (
                <motion.div
                  key="thinking"
                  className={styles.thinkingBar}
                  initial={{ opacity: 0, y: 16, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.98 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  <span className={styles.thinkingText}>Волна несёт ответ</span>
                  <span className={styles.dots} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="composer"
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.24, ease: EASE }}
                >
                  {composer}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── Правая часть: окно кода (split view 60%) ── */}
        <AnimatePresence>
          {panelOpen && activeArtifact && (
            <motion.section
              className={styles.codePane}
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 48 }}
              transition={{ duration: 0.45, ease: EASE }}
              aria-label="Окно кода"
            >
              <div className={styles.codeTabs}>
                {activeArtifact.previewHtml !== null && (
                  <div className={styles.viewSwitch}>
                    <button
                      type="button"
                      className={[styles.switchBtn, codeView === 'code' && styles.switchActive].filter(Boolean).join(' ')}
                      onClick={() => setCodeView('code')}
                    >
                      <Code2 size={13} strokeWidth={1.8} aria-hidden="true" />
                      Код
                    </button>
                    <button
                      type="button"
                      className={[styles.switchBtn, codeView === 'preview' && styles.switchActive].filter(Boolean).join(' ')}
                      onClick={() => setCodeView('preview')}
                    >
                      <Eye size={13} strokeWidth={1.8} aria-hidden="true" />
                      Превью
                    </button>
                  </div>
                )}
                <div className={styles.codeTools}>
                  {codeView === 'code' && activeMessage !== null && (
                    <button
                      type="button"
                      className={[styles.topBtn, pinnedIds.has(activeMessage.id) && styles.topBtnSaved]
                        .filter(Boolean).join(' ')}
                      onClick={() => pinToVault(activeMessage)}
                      title="Сохранить план и код в Дневник идей"
                    >
                      <Pin size={14} strokeWidth={1.8} aria-hidden="true" />
                      {pinnedIds.has(activeMessage.id) ? 'В дневнике' : 'В дневник'}
                    </button>
                  )}
                  {codeView === 'code' && (
                    <button type="button" className={styles.topBtn} onClick={() => void explain()}>
                      <Sparkles size={14} strokeWidth={1.8} aria-hidden="true" />
                      Объяснить
                    </button>
                  )}
                  {codeView === 'preview' && activeArtifact.previewHtml !== null && (
                    <button
                      type="button"
                      className={styles.topBtn}
                      onClick={() => {
                        const url = URL.createObjectURL(new Blob([activeArtifact.previewHtml ?? ''], { type: 'text/html' }))
                        window.open(url, '_blank', 'noopener')
                      }}
                    >
                      <ExternalLink size={14} strokeWidth={1.8} aria-hidden="true" />
                      Открыть превью
                    </button>
                  )}
                  <button
                    type="button"
                    className={styles.topBtn}
                    onClick={() => {
                      setPanelOpen(false)
                      setCodeView('code')
                    }}
                  >
                    <EyeOff size={14} strokeWidth={1.8} aria-hidden="true" />
                    Скрыть
                  </button>
                </div>
              </div>

              {codeView === 'code' ? (
                <CodeDiffViewer
                  artifact={activeArtifact}
                  previousCode={previousCode}
                  streaming={streamingId !== null}
                />
              ) : (
                <div className={styles.previewWrap}>
                  <iframe
                    className={styles.previewFrame}
                    title={`Превью ${activeArtifact.title}`}
                    srcDoc={activeArtifact.previewHtml ?? undefined}
                    sandbox="allow-scripts"
                  />
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <FileDrawer
        open={filesOpen}
        selected={selectedFiles}
        onToggle={toggleFile}
        onClose={() => setFilesOpen(false)}
      />

      <ProjectVault
        open={vaultOpen}
        entries={vaultEntries}
        onRemove={removeFromVault}
        onClear={wipeVault}
        onClose={() => setVaultOpen(false)}
      />
    </div>
  )
}
