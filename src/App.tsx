import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { BrainCircuit, Sparkles, UserRound } from 'lucide-react'
import { CHARACTERS, isCharacterId, type CharacterId } from './characters'
import { BottomNav, type TabId } from './components/layout/BottomNav'
import { CharacterSwitch } from './components/layout/CharacterSwitch'
import { Bubbles } from './components/scene/Bubbles'
import { SceneBackground } from './components/scene/SceneBackground'
import { useSceneQuality } from './hooks/useSceneQuality'
import { readStorage, writeStorage } from './lib/storage'
import { HomeHero } from './pages/HomeHero'
import { StagePage } from './pages/StagePage'
import styles from './App.module.css'

const CHARACTER_KEY = 'zr:character'
const EASE = [0.22, 0.61, 0.36, 1] as const

function renderPage(tab: TabId, character: CharacterId) {
  switch (tab) {
    case 'home':
      return <HomeHero character={character} />

    case 'wishes':
      return (
        <StagePage
          id="wishes"
          stage="Этап 2"
          title="Желания"
          description="Здесь появятся желания: план из 3–7 шагов, прогресс и статус. Без счётчиков и лимитов — желаний может быть сколько угодно."
          icon={Sparkles}
          items={[
            'Создание желания текстом или голосом',
            'План из 3–7 шагов от рыбки',
            'Прогресс-бар и статусы: новое / в работе / исполнено',
            'Праздничная анимация исполнения',
          ]}
        />
      )

    case 'memory':
      return (
        <StagePage
          id="memory"
          stage="Этап 4"
          title="Память"
          description="Рыбка запомнит имя, цели, привычки и важные даты — и будет учитывать их в каждом ответе."
          icon={BrainCircuit}
          items={[
            'Факты о пользователе и их редактирование',
            'Использование памяти в системном промте',
            'Экспорт и удаление данных одной кнопкой',
          ]}
        />
      )

    case 'profile':
      return (
        <StagePage
          id="profile"
          stage="Этап 5"
          title="Профиль"
          description="Гостевой режим и вход по magic link. Регистрация необязательна и ничего не ограничивает."
          icon={UserRound}
          items={[
            'Гостевые данные в localStorage',
            'Вход по email-magic-link',
            'Перенос гостевых данных в аккаунт',
            'Настройки голоса, анимаций и уведомлений',
          ]}
        />
      )
  }
}

export function App() {
  const quality = useSceneQuality()
  const reducedMotion = useReducedMotion()
  const [character, setCharacter] = useState<CharacterId>(() => {
    const stored = readStorage(CHARACTER_KEY, 'fish')
    return isCharacterId(stored) ? stored : 'fish'
  })
  const [tab, setTab] = useState<TabId>('home')

  useEffect(() => {
    document.documentElement.dataset.character = character
    writeStorage(CHARACTER_KEY, character)

    const themeColor = document.querySelector('meta[name="theme-color"]')
    themeColor?.setAttribute('content', character === 'kolobok' ? '#0a0603' : '#02040c')
  }, [character])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' })
  }, [tab, reducedMotion])

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

          <CharacterSwitch value={character} onChange={setCharacter} />
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
              {renderPage(tab, character)}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav value={tab} onChange={setTab} />
      </div>
    </div>
  )
}
