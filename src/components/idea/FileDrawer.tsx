/**
 * Выезжающая панель файлов проекта (File Drawer).
 *
 * Матовое стекло, 300px, плавно выезжает слева через Framer Motion.
 * Чекбоксы показывают, какие файлы уходят в контекст ИИ —
 * пользователь всегда видит, «что Рыбка читает».
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Check, FileCode2, FolderOpen, X } from 'lucide-react'
import {
  formatFileSize,
  MOCK_PROJECT_FILES,
  MOCK_PROJECT_NAME,
  type RepoFile,
} from '../../idea/mockRepo'
import styles from './FileDrawer.module.css'

interface FileDrawerProps {
  open: boolean
  selected: ReadonlySet<string>
  onToggle: (path: string) => void
  onClose: () => void
}

const EASE = [0.22, 0.61, 0.36, 1] as const

function languageBadge(file: RepoFile): string {
  switch (file.language) {
    case 'tsx':
      return 'TSX'
    case 'ts':
      return 'TS'
    case 'css':
      return 'CSS'
    case 'json':
      return 'JSON'
    case 'markdown':
      return 'MD'
    default:
      return file.language.toUpperCase().slice(0, 4)
  }
}

export function FileDrawer({ open, selected, onToggle, onClose }: FileDrawerProps) {
  const count = MOCK_PROJECT_FILES.filter((file) => selected.has(file.path)).length

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            className={styles.drawer}
            role="dialog"
            aria-label="Файлы проекта"
            initial={{ x: -320, opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -320, opacity: 0.6 }}
            transition={{ duration: 0.34, ease: EASE }}
          >
            <header className={styles.header}>
              <div className={styles.titleGroup}>
                <FolderOpen size={17} strokeWidth={1.8} className={styles.titleIcon} aria-hidden="true" />
                <div>
                  <h2 className={styles.title}>Файлы проекта</h2>
                  <p className={styles.subtitle}>
                    {MOCK_PROJECT_NAME} · в контексте: {count} из {MOCK_PROJECT_FILES.length}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.close}
                onClick={onClose}
                aria-label="Закрыть панель файлов"
              >
                <X size={17} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </header>

            <p className={styles.note}>
              Отмеченные файлы Рыбка читает перед ответом. Снимай галочки — меньше шума, точнее идея.
            </p>

            <ul className={styles.list}>
              {MOCK_PROJECT_FILES.map((file, index) => {
                const checked = selected.has(file.path)
                return (
                  <motion.li
                    key={file.path}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.26, delay: 0.03 * index, ease: EASE }}
                  >
                    <label className={[styles.row, checked && styles.rowChecked].filter(Boolean).join(' ')}>
                      <input
                        type="checkbox"
                        className={styles.checkbox}
                        checked={checked}
                        onChange={() => onToggle(file.path)}
                      />
                      <span className={styles.customCheck} aria-hidden="true">
                        {checked && <Check size={12} strokeWidth={3} />}
                      </span>
                      <FileCode2 size={15} strokeWidth={1.6} className={styles.fileIcon} aria-hidden="true" />
                      <span className={styles.filePath} title={file.path}>
                        {file.path}
                      </span>
                      <span className={styles.badge}>{languageBadge(file)}</span>
                      <span className={styles.size}>{formatFileSize(file.size)}</span>
                    </label>
                  </motion.li>
                )
              })}
            </ul>

            <footer className={styles.footer}>
              Контекст: {(MOCK_PROJECT_FILES.filter((f) => selected.has(f.path)).reduce((sum, f) => sum + f.size, 0) / 1024).toFixed(1)} КБ · ни один байт не уходит без твоего ведома
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
