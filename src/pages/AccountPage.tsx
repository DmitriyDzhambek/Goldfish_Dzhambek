import { useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Github,
  Loader2,
  LogIn,
  LogOut,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'
import type { TabId } from '../components/layout/BottomNav'
import { GlassCard } from '../components/ui/GlassCard'
import { useAuth } from '../hooks/useAuth'
import styles from './AccountPage.module.css'

export interface AuthNotice {
  kind: 'ok' | 'error'
  text: string
}

interface AccountPageProps {
  notice: AuthNotice | null
  onDismissNotice: () => void
  onNavigate: (tab: TabId) => void
}

function formatJoined(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'недавно'

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

const FEATURES: ReadonlyArray<{ id: TabId; title: string; text: string; icon: typeof Code2 }> = [
  {
    id: 'home',
    title: 'Студия идей',
    text: 'Идея словами → видение, стек и готовый код.',
    icon: Code2,
  },
  {
    id: 'history',
    title: 'История',
    text: 'Архив твоих идей — любую можно продолжить.',
    icon: BrainCircuit,
  },
  {
    id: 'settings',
    title: 'Настройки',
    text: 'API-ключ и аккаунт — всё в одном месте.',
    icon: Sparkles,
  },
]

export function AccountPage({ notice, onDismissNotice, onNavigate }: AccountPageProps) {
  const { me, loading, busy, error, login, logout, clearError } = useAuth()
  const [confirmLogout, setConfirmLogout] = useState(false)

  const account = me?.account ?? null
  const authenticated = Boolean(me?.authenticated && account)
  const shownError = error

  return (
    <section className={styles.page} aria-labelledby="account-title">
      <header className={styles.hero}>
        <p className={styles.eyebrow}>личный кабинет</p>
        <h1 id="account-title" className={styles.title}>
          Кабинет
        </h1>
        <p className={styles.lead}>
          Вход через Яндекс нужен только для синхронизации между устройствами.
          Гость получает весь функционал — без регистрации, paywall и рекламы.
        </p>
        <ul className={styles.chips}>
          <li>MIT</li>
          <li>без рекламы</li>
          <li>данные можно удалить</li>
        </ul>
      </header>

      {notice && (
        <div
          className={[styles.notice, notice.kind === 'error' && styles.noticeError]
            .filter(Boolean)
            .join(' ')}
          role="status"
        >
          {notice.kind === 'ok' ? (
            <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
          )}
          <span>{notice.text}</span>
          <button type="button" onClick={onDismissNotice}>
            Закрыть
          </button>
        </div>
      )}

      {shownError && (
        <div className={styles.noticeError} role="alert">
          <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
          <span>{shownError}</span>
          <button type="button" onClick={clearError}>
            Закрыть
          </button>
        </div>
      )}

      {loading && !me ? (
        <GlassCard className={styles.loadingCard}>
          <Loader2 className={styles.spin} size={18} strokeWidth={2} aria-hidden="true" />
          <p>Проверяю вход…</p>
        </GlassCard>
      ) : (
        <div className={styles.grid}>
          <GlassCard className={styles.accountCard}>
            {authenticated && account ? (
              <>
                <div className={styles.profileHead}>
                  {account.avatarUrl ? (
                    <img
                      className={styles.avatar}
                      src={account.avatarUrl}
                      alt=""
                      width={56}
                      height={56}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden="true">
                      <UserRound size={24} strokeWidth={1.8} />
                    </span>
                  )}

                  <div className={styles.profileText}>
                    <span className={styles.badge}>
                      <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
                      Яндекс ID
                    </span>
                    <h2 className={styles.name}>{account.name}</h2>
                    {account.email && <p className={styles.email}>{account.email}</p>}
                    <p className={styles.joined}>В аккаунте с {formatJoined(account.createdAt)}</p>
                  </div>
                </div>

                <p className={styles.accountHint}>
                  Желания и факты памяти привязаны к аккаунту и доступны на других
                  устройствах. Гостевые данные перенесены автоматически.
                </p>

                <div className={styles.accountActions}>
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => onNavigate('home')}
                  >
                    <Code2 size={16} strokeWidth={2} aria-hidden="true" />
                    Открыть студию идей
                  </button>

                  {confirmLogout ? (
                    <span className={styles.confirmRow}>
                      <button
                        type="button"
                        className={styles.danger}
                        onClick={() => void logout()}
                        disabled={busy}
                      >
                        {busy ? 'Выхожу…' : 'Точно выйти'}
                      </button>
                      <button
                        type="button"
                        className={styles.ghost}
                        onClick={() => setConfirmLogout(false)}
                        disabled={busy}
                      >
                        Отмена
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={styles.ghost}
                      onClick={() => setConfirmLogout(true)}
                      disabled={busy}
                    >
                      <LogOut size={15} strokeWidth={2} aria-hidden="true" />
                      Выйти
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className={styles.guestHead}>
                  <span className={styles.guestGlyph} aria-hidden="true">
                    <UserRound size={24} strokeWidth={1.7} />
                  </span>
                  <div>
                    <span className={styles.badge}>гостевой режим</span>
                    <h2 className={styles.name}>Ты — гость. И это нормально.</h2>
                  </div>
                </div>

                <p className={styles.accountHint}>
                  Весь функционал уже открыт: чат, желания, память, вайбкодинг. Данные
                  хранятся на этом устройстве и привязаны к анонимному ID. Вход нужен,
                  только чтобы открыть их на другом устройстве.
                </p>

                <ul className={styles.benefits}>
                  <li>
                    <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                    Без обязательной регистрации
                  </li>
                  <li>
                    <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                    Гостевые данные перенесутся в аккаунт
                  </li>
                  <li>
                    <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" />
                    Выйти можно в любой момент
                  </li>
                </ul>

                <button
                  type="button"
                  className={styles.yandex}
                  onClick={login}
                  disabled={busy}
                >
                  <LogIn size={17} strokeWidth={2.1} aria-hidden="true" />
                  Войти через Яндекс
                </button>

                {me && !me.oauthEnabled && (
                  <div className={styles.configNote}>
                    <AlertTriangle size={16} strokeWidth={2} aria-hidden="true" />
                    <div>
                      <p className={styles.configTitle}>OAuth пока не настроен на сервере</p>
                      <p>
                        Добавь в <code>.env</code> переменные{' '}
                        <code>YANDEX_CLIENT_ID</code>, <code>YANDEX_CLIENT_SECRET</code> и{' '}
                        <code>YANDEX_REDIRECT_URI</code>. Гостевой режим работает без них.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className={styles.privacy}>
              <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
              <span>
                Секреты LLM и OAuth остаются на сервере. Токен GitHub живёт только
                в этой вкладке и не отправляется на наш сервер.
              </span>
            </div>
          </GlassCard>

          <div className={styles.side}>
            <GlassCard className={styles.featuresCard}>
              <h2 className={styles.sectionTitle}>Что уже открыто</h2>
              <ul className={styles.features}>
                {FEATURES.map(({ id, title, text, icon: Icon }) => (
                  <li key={id}>
                    <button
                      type="button"
                      className={styles.feature}
                      onClick={() => onNavigate(id)}
                    >
                      <span className={styles.featureIcon} aria-hidden="true">
                        <Icon size={16} strokeWidth={1.9} />
                      </span>
                      <span className={styles.featureText}>
                        <span className={styles.featureTitle}>{title}</span>
                        <span className={styles.featureNote}>{text}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </GlassCard>

            <GlassCard className={styles.privacyCard}>
              <span className={styles.privacyIcon} aria-hidden="true">
                <Github size={18} strokeWidth={1.8} />
              </span>
              <h2 className={styles.sectionTitle}>Проекты и GitHub</h2>
              <p className={styles.privacyText}>
                Локальная папка читается браузером через File System Access API.
                Публичный GitHub-репозиторий импортируется без токена. Приватный —
                с личным токеном, который хранится только в sessionStorage.
              </p>
            </GlassCard>
          </div>
        </div>
      )}
    </section>
  )
}
