import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CHARACTERS, isCharacterId, type CharacterId } from './characters'
import { IdeaWorkspace } from './components/idea/IdeaWorkspace'
import { BottomNav, type TabId } from './components/layout/BottomNav'
import { CharacterSwitch } from './components/layout/CharacterSwitch'
import { Bubbles } from './components/scene/Bubbles'
import { SceneBackground } from './components/scene/SceneBackground'
import { useSceneQuality } from './hooks/useSceneQuality'
import { useTGConnect } from './hooks/useTGConnect'
import { readStorage, writeStorage } from './lib/storage'
import type { AuthNotice } from './pages/AccountPage'
import type { IdeaSession } from './idea/sessions'
import { AdminTab } from './pages/AdminTab'
import { DiaryTab } from './pages/DiaryTab'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { WorkspaceTab } from './pages/WorkspaceTab'
import styles from './App.module.css'

const CHARACTER_KEY = 'zr:character'
const EASE = [0.22, 0.61, 0.36, 1] as const

const AUTH_NOTICE_OK: AuthNotice = {
  kind: 'ok',
  text: 'Вход выполнен. Гостевые желания и память перенесены в аккаунт.',
}

const AUTH_NOTICE_ERROR: AuthNotice = {
  kind: 'error',
  text: 'Вход через Яндекс не завершился. Попробуй ещё раз — гостевой режим работает как обычно.',
}

/** Забирает `?auth=ok|error` из адреса, чтобы перезагрузка не повторяла уведомление. */
function takeAuthNotice(): AuthNotice | null {
  if (typeof window === 'undefined') return null

  const params = new URLSearchParams(window.location.search)
  const status = params.get('auth')
  if (!status) return null

  params.delete('auth')
  const search = params.toString()
  window.history.replaceState(
    {},
    '',
    `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`,
  )

  return status === 'ok' ? AUTH_NOTICE_OK : AUTH_NOTICE_ERROR
}

export function App() {
  const quality = useSceneQuality()
  const reducedMotion = useReducedMotion()
  const [character, setCharacter] = useState<CharacterId>(() => {
    const stored = readStorage(CHARACTER_KEY, 'fish')
    return isCharacterId(stored) ? stored : 'fish'
  })
  const [tab, setTab] = useState<TabId>('home')
  const [authNotice, setAuthNotice] = useState<AuthNotice | null>(() => takeAuthNotice())
  const [resumeSession, setResumeSession] = useState<IdeaSession | null>(null)
  const [chatSeed, setChatSeed] = useState<string | null>(null)
  const { user, isAdmin } = useTGConnect()

  useEffect(() => {
    document.documentElement.dataset.character = character
    writeStorage(CHARACTER_KEY, character)

    const themeColor = document.querySelector('meta[name="theme-color"]')
    themeColor?.setAttribute('content', character === 'kolobok' ? '#0a0603' : '#0a0e17')
  }, [character])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [tab, reducedMotion])

  const page = (() => {
    // Стена убрана: гость сразу видит интерфейс (Чат работает, Дневник
    // приглашает к входу контекстной модалкой). Нижнее меню всегда на месте.
    switch (tab) {
      case 'home':
        return (
          <IdeaWorkspace
            resumeSession={resumeSession}
            onResumeConsumed={() => setResumeSession(null)}
            seedText={chatSeed}
            onSeedConsumed={() => setChatSeed(null)}
          />
        )

      case 'diary':
        return (
          <DiaryTab
            onIdeaToChat={(text) => {
              setChatSeed(text)
              setTab('home')
            }}
          />
        )

      case 'workspace':
        return (
          <WorkspaceTab
            onDiscuss={(prompt) => {
              setChatSeed(prompt)
              setTab('home')
            }}
          />
        )

      case 'admin':
        return <AdminTab />

      case 'history':
        return (
          <HistoryPage
            onOpenSession={(session) => {
              setResumeSession(session)
              setTab('home')
            }}
          />
        )

      case 'settings':
        return (
          <SettingsPage
            notice={authNotice}
            onDismissNotice={() => setAuthNotice(null)}
            onNavigateHome={() => setTab('home')}
          />
        )
    }
  })()

  return (
    <div className={styles.app}>
      <SceneBackground quality={quality} />
      <Bubbles enabled={quality.particles} />

      <div className={styles.shell}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.brand}
            onClick={() => setTab('home')}
            aria-label="Золотая рыбка — на главную"
          >
            <span className={styles.brandGlyph} aria-hidden="true">
              {CHARACTERS[character].emoji}
            </span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>Золотая рыбка</span>
              <span className={styles.brandTag}>бесплатно · без лимитов</span>
            </span>
          </button>

          <div className={styles.headerRight}>
            <CharacterSwitch value={character} onChange={setCharacter} />

            {/* Аватарка и имя из Telegram — мгновенно, без логина */}
            {user !== null && (
              <motion.div
                className={styles.profile}
                title={user.username ? `@${user.username}` : undefined}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: EASE }}
              >
                {user.photo_url ? (
                  <img className={styles.profileAvatar} src={user.photo_url} alt="" />
                ) : (
                  <span className={styles.profileAvatar} aria-hidden="true">
                    {(user.first_name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <span className={styles.profileName}>
                  {user.first_name ?? ''}
                  {isAdmin ? ' · админ' : ''}
                </span>
              </motion.div>
            )}
          </div>
        </header>

        <main className={styles.main}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              className={styles.page}
              initial={{ opacity: 0, y: reducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reducedMotion ? 0 : -6 }}
              transition={{ duration: reducedMotion ? 0 : 0.24, ease: EASE }}
            >
              {page}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav value={tab} onChange={setTab} isAdmin={isAdmin} />
      </div>
    </div>
  )
}
