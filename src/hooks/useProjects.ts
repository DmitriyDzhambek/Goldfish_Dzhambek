/**
 * useProjects — «Рабочее пространство» пользователя.
 *
 * У каждого пользователя свой список проектов: идеи развиваются
 * от первой мысли до кода. Данные живут в localStorage по ключу
 * `kolobok_projects_${userId}`, где userId — Telegram ID или 'guest'.
 *
 * Хранение локальное и мгновенное: данные не теряются при
 * обновлении страницы, а ключ зависит от пользователя, поэтому
 * гостевые проекты не смешиваются с проектами аккаунта.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { getGuestId } from '../lib/guest'
import { useTGConnect } from './useTGConnect'

export type IdeaNodeType = 'idea' | 'task' | 'code'
export type ProjectStatus = 'active' | 'done' | 'archived'

export interface IdeaNode {
  id: string
  title: string
  type: IdeaNodeType
  /** Заметка этапа, промт для Рыбки или её ответ с кодом. */
  content: string
  isCompleted: boolean
  createdAt: number
}

export interface Project {
  id: string
  title: string
  description: string
  status: ProjectStatus
  nodes: IdeaNode[]
  createdAt: number
}

export interface NewNodeInput {
  title: string
  type?: IdeaNodeType
  content?: string
}

const STORAGE_PREFIX = 'kolobok_projects_'

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Защита от повреждённого JSON: сломанный список не роняет приложение. */
function parseProjects(raw: string): Project[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is Project =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Project).id === 'string' &&
        typeof (item as Project).title === 'string' &&
        Array.isArray((item as Project).nodes),
    )
  } catch {
    return []
  }
}

function loadProjects(storageKey: string): Project[] {
  const raw = readStorage(storageKey, '')
  if (!raw) return []
  return parseProjects(raw)
}

export function useProjects() {
  const { user } = useTGConnect()
  const userId = user !== null ? String(user.id) : getGuestId() || 'guest'
  const storageKey = useMemo(() => `${STORAGE_PREFIX}${userId}`, [userId])

  const [projects, setProjects] = useState<Project[]>(() => loadProjects(storageKey))

  // Смена пользователя (гость → аккаунт): подгружаем его проекты.
  useEffect(() => {
    setProjects(loadProjects(storageKey))
  }, [storageKey])

  // Любое изменение мгновенно уходит в localStorage — данные не теряются.
  useEffect(() => {
    try {
      writeStorage(storageKey, JSON.stringify(projects))
    } catch {
      // Хранилище недоступно — работаем в памяти этой сессии.
    }
  }, [storageKey, projects])

  const addProject = useCallback((title: string, description = ''): Project | null => {
    const trimmed = title.trim()
    if (!trimmed) return null

    const project: Project = {
      id: uid('proj'),
      title: trimmed,
      description: description.trim(),
      status: 'active',
      nodes: [],
      createdAt: Date.now(),
    }
    setProjects((previous) => [project, ...previous])
    return project
  }, [])

  const deleteProject = useCallback((projectId: string) => {
    setProjects((previous) => previous.filter((project) => project.id !== projectId))
  }, [])

  const addNodeToProject = useCallback((projectId: string, input: NewNodeInput): IdeaNode | null => {
    const trimmed = input.title.trim()
    if (!trimmed) return null

    const node: IdeaNode = {
      id: uid('node'),
      title: trimmed,
      type: input.type ?? 'task',
      content: input.content ?? '',
      isCompleted: false,
      createdAt: Date.now(),
    }

    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, nodes: [...project.nodes, node] }
          : project,
      ),
    )
    return node
  }, [])

  const toggleNodeStatus = useCallback((projectId: string, nodeId: string) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? {
              ...project,
              nodes: project.nodes.map((node) =>
                node.id === nodeId ? { ...node, isCompleted: !node.isCompleted } : node,
              ),
            }
          : project,
      ),
    )
  }, [])

  /** Сохраняет текст внутри узла: заметка, промт Рыбке или её ответ с кодом. */
  const updateNodeContent = useCallback((projectId: string, nodeId: string, content: string) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? {
              ...project,
              nodes: project.nodes.map((node) =>
                node.id === nodeId ? { ...node, content } : node,
              ),
            }
          : project,
      ),
    )
  }, [])

  const deleteNode = useCallback((projectId: string, nodeId: string) => {
    setProjects((previous) =>
      previous.map((project) =>
        project.id === projectId
          ? { ...project, nodes: project.nodes.filter((node) => node.id !== nodeId) }
          : project,
      ),
    )
  }, [])

  return {
    projects,
    addProject,
    deleteProject,
    addNodeToProject,
    toggleNodeStatus,
    updateNodeContent,
    deleteNode,
  }
}

/** Готовый промт: «Рыбка, вот мой проект … Напиши код для этого этапа». */
export function buildNodePrompt(project: Project, node: IdeaNode): string {
  return (
    `Рыбка, вот мой проект «${project.title}». ` +
    `Этап: «${node.title}». Напиши код для этого этапа.` +
    (project.description ? ` Описание проекта: ${project.description}.` : '')
  )
}
