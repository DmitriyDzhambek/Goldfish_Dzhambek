/**
 * Рабочее пространство — «Карта Идей».
 *
 * Слева — боковая панель проектов (300px, тёмное стекло, золотой акцент
 * у активного). В центре — карта идей активного проекта: вертикальная
 * цепочка карточек-этапов, соединённых светящимися линиями. Выполненные
 * этапы светятся бирюзовым, идущие в работе — мягко пульсируют.
 *
 * Любой этап можно отправить Рыбке: промт уходит в чат, а запрос
 * сохраняется внутри узла, чтобы контекст не потерялся.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Check,
  Code2,
  GitBranch,
  Lightbulb,
  MessageCircle,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import {
  buildNodePrompt,
  useProjects,
  type IdeaNode,
  type Project,
} from '../hooks/useProjects'
import styles from './WorkspaceTab.module.css'

const EASE = [0.22, 0.61, 0.36, 1] as const

const NODE_META: Record<IdeaNode['type'], { label: string; icon: typeof Lightbulb }> = {
  idea: { label: 'Идея', icon: Lightbulb },
  task: { label: 'Этап', icon: GitBranch },
  code: { label: 'Код', icon: Code2 },
}

interface WorkspaceTabProps {
  /** Промт для Рыбки: уходит в чат как предзаполненное поле ввода. */
  onDiscuss: (prompt: string) => void
}

export function WorkspaceTab({ onDiscuss }: WorkspaceTabProps) {
  const reducedMotion = useReducedMotion()
  const {
    projects,
    addProject,
    deleteProject,
    addNodeToProject,
    toggleNodeStatus,
    updateNodeContent,
    deleteNode,
  } = useProjects()

  const [activeId, setActiveId] = useState<string | null>(projects[0]?.id ?? null)
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeId) ?? null,
    [projects, activeId],
  )

  // Форма нового проекта
  const [projectTitle, setProjectTitle] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)

  // Форма нового узла
  const [nodeTitle, setNodeTitle] = useState('')
  const [nodeType, setNodeType] = useState<IdeaNode['type']>('task')
  const [addingNode, setAddingNode] = useState(false)

  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  function handleCreateProject() {
    const created = addProject(projectTitle)
    if (created) {
      setActiveId(created.id)
      setProjectTitle('')
      setCreatingProject(false)
    }
  }

  function handleAddNode() {
    if (!activeProject) return
    const created = addNodeToProject(activeProject.id, { title: nodeTitle, type: nodeType })
    if (created) {
      setNodeTitle('')
      setAddingNode(false)
    }
  }

  function askFish(project: Project, node: IdeaNode) {
    const prompt = buildNodePrompt(project, node)
    // Запрос остаётся в узле: контекст не теряется между вкладками.
    const stamped = node.content
      ? node.content
      : `→ Запрос Рыбке: «${prompt}»`
    updateNodeContent(project.id, node.id, stamped)
    setOpenMenuId(null)
    onDiscuss(prompt)
  }

  return (
    <div className={styles.workspace}>
      {/* ── Боковая панель проектов ─────────────────────────────── */}
      <aside className={styles.sidebar} aria-label="Проекты">
        <motion.button
          type="button"
          className={styles.newProject}
          onClick={() => setCreatingProject((value) => !value)}
          whileTap={reducedMotion ? undefined : { scale: 0.97 }}
        >
          <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
          Новый проект
        </motion.button>

        <AnimatePresence initial={false}>
          {creatingProject && (
            <motion.div
              className={styles.creator}
              initial={reducedMotion ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reducedMotion ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
            >
              <input
                className={styles.creatorInput}
                value={projectTitle}
                placeholder="О чём мечтаешь?"
                autoFocus
                onChange={(event) => setProjectTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleCreateProject()
                  if (event.key === 'Escape') setCreatingProject(false)
                }}
              />
              <button
                type="button"
                className={styles.creatorSubmit}
                onClick={handleCreateProject}
                disabled={!projectTitle.trim()}
              >
                Создать
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={styles.projectList}>
          <AnimatePresence initial={false}>
            {projects.map((project) => {
              const active = project.id === activeId
              const doneCount = project.nodes.filter((node) => node.isCompleted).length

              return (
                <motion.div
                  key={project.id}
                  className={[styles.projectCard, active && styles.projectCardActive]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setActiveId(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setActiveId(project.id)
                  }}
                  role="button"
                  tabIndex={0}
                  initial={reducedMotion ? false : { opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reducedMotion ? undefined : { opacity: 0, x: -16, height: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  whileHover={reducedMotion ? undefined : { x: 2 }}
                >
                  <div className={styles.projectCardTop}>
                    <span className={styles.projectTitle}>{project.title}</span>
                    <button
                      type="button"
                      className={styles.iconButton}
                      aria-label={`Удалить проект ${project.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        deleteProject(project.id)
                        if (active) setActiveId(null)
                      }}
                    >
                      <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </div>
                  <span className={styles.projectMeta}>
                    {project.nodes.length === 0
                      ? 'Пока пусто — добавь первый этап'
                      : `${doneCount} из ${project.nodes.length} этапов`}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {projects.length === 0 && (
            <p className={styles.sidebarEmpty}>
              У тебя пока нет проектов. Нажми «Новый проект» — и Рыбка поможет
              развить идею до кода.
            </p>
          )}
        </div>
      </aside>

      {/* ── Карта идей ──────────────────────────────────────────── */}
      <section className={styles.map} aria-label="Карта идей">
        {activeProject === null ? (
          <div className={styles.mapEmpty}>
            <GitBranch size={36} strokeWidth={1.4} aria-hidden="true" />
            <h2 className={styles.mapEmptyTitle}>Карта Идей</h2>
            <p className={styles.mapEmptyText}>
              Выбери проект слева или создай новый. Каждый этап появится здесь
              светящейся карточкой на карте.
            </p>
          </div>
        ) : (
          <>
            <motion.header
              className={styles.mapHeader}
              initial={reducedMotion ? false : { opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.36, ease: EASE }}
            >
              <h2 className={styles.mapTitle}>{activeProject.title}</h2>
              {activeProject.description && (
                <p className={styles.mapDescription}>{activeProject.description}</p>
              )}
            </motion.header>

            <div className={styles.chain}>
              <AnimatePresence initial={false}>
                {activeProject.nodes.map((node, index) => {
                  const meta = NODE_META[node.type]
                  const Icon = meta.icon
                  const menuOpen = openMenuId === node.id

                  return (
                    <motion.div
                      key={node.id}
                      className={styles.chainItem}
                      initial={reducedMotion ? false : { opacity: 0, y: 24, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.94 }}
                      transition={{
                        duration: 0.42,
                        ease: EASE,
                        delay: reducedMotion ? 0 : Math.min(index * 0.06, 0.4),
                      }}
                    >
                      {/* Светящаяся линия-связь между этапами */}
                      {index > 0 && (
                        <motion.span
                          className={styles.connector}
                          aria-hidden="true"
                          initial={reducedMotion ? false : { scaleY: 0 }}
                          animate={{ scaleY: 1 }}
                          transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
                        />
                      )}

                      <div
                        className={[
                          styles.nodeCard,
                          node.isCompleted ? styles.nodeCompleted : styles.nodePending,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <div className={styles.nodeTop}>
                          <span className={styles.nodeBadge}>
                            <Icon size={12} strokeWidth={2} aria-hidden="true" />
                            {meta.label}
                          </span>
                          <div className={styles.nodeActions}>
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label={
                                node.isCompleted
                                  ? 'Вернуть этап в работу'
                                  : 'Отметить этап выполненным'
                              }
                              onClick={() => toggleNodeStatus(activeProject.id, node.id)}
                            >
                              {node.isCompleted ? (
                                <X size={13} strokeWidth={2} aria-hidden="true" />
                              ) : (
                                <Check size={13} strokeWidth={2} aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              className={styles.iconButton}
                              aria-label={`Удалить этап ${node.title}`}
                              onClick={() => deleteNode(activeProject.id, node.id)}
                            >
                              <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          className={styles.nodeTitleButton}
                          onClick={() => setOpenMenuId(menuOpen ? null : node.id)}
                        >
                          <span className={styles.nodeTitle}>{node.title}</span>
                        </button>

                        {node.content && (
                          <p className={styles.nodeContent}>{node.content}</p>
                        )}

                        <AnimatePresence initial={false}>
                          {menuOpen && (
                            <motion.div
                              className={styles.nodeMenu}
                              initial={reducedMotion ? false : { opacity: 0, y: -6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={reducedMotion ? undefined : { opacity: 0, y: -6 }}
                              transition={{ duration: 0.22, ease: EASE }}
                            >
                              <button
                                type="button"
                                className={styles.nodeMenuAction}
                                onClick={() => askFish(activeProject, node)}
                              >
                                <MessageCircle size={14} strokeWidth={1.9} aria-hidden="true" />
                                Попросить Рыбку написать код
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>

              {/* Добавление этапа */}
              <motion.div
                className={styles.chainItem}
                initial={reducedMotion ? false : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.42, ease: EASE, delay: 0.15 }}
              >
                {activeProject.nodes.length > 0 && (
                  <span className={styles.connector} aria-hidden="true" />
                )}
                {addingNode ? (
                  <div className={styles.nodeCreator}>
                    <input
                      className={styles.creatorInput}
                      value={nodeTitle}
                      placeholder="Например: сделать дизайн профиля"
                      autoFocus
                      onChange={(event) => setNodeTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleAddNode()
                        if (event.key === 'Escape') setAddingNode(false)
                      }}
                    />
                    <div className={styles.nodeTypeRow}>
                      {(['idea', 'task', 'code'] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          className={[
                            styles.nodeTypeButton,
                            nodeType === type && styles.nodeTypeButtonActive,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => setNodeType(type)}
                        >
                          {NODE_META[type].label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className={styles.creatorSubmit}
                      onClick={handleAddNode}
                      disabled={!nodeTitle.trim()}
                    >
                      Добавить на карту
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.addNode}
                    onClick={() => setAddingNode(true)}
                  >
                    <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
                    Добавить этап
                  </button>
                )}
              </motion.div>
            </div>

            <motion.div
              className={styles.discussRow}
              initial={reducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
            >
              <button
                type="button"
                className={styles.discussButton}
                onClick={() =>
                  onDiscuss(
                    `Рыбка, вот мой проект «${activeProject.title}». ` +
                      `Расскажи, с какого этапа лучше начать?`,
                  )
                }
              >
                <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
                Обсудить с Рыбкой
              </button>
            </motion.div>
          </>
        )}
      </section>
    </div>
  )
}
