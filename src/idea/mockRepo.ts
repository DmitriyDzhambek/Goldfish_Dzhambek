/**
 * Моковый репозиторий для панели файлов.
 *
 * Пока пользователь не подключил свой GitHub или папку, показываем
 * проект «ВПН + шагомер» — так контекст ИИ виден сразу и осязаемо.
 * Позже этот же контракт наполнится файлами из GitHub API.
 */

export interface RepoFile {
  path: string
  language: string
  /** Условный «вес» файла для контекста, в байтах. */
  size: number
  /** Файлы, которые Рыбка считает важными по умолчанию. */
  recommended: boolean
}

export const MOCK_PROJECT_NAME = 'vpn-steps-app'

export const MOCK_PROJECT_FILES: readonly RepoFile[] = [
  { path: 'package.json', language: 'json', size: 842, recommended: true },
  { path: 'tsconfig.json', language: 'json', size: 610, recommended: false },
  { path: 'App.tsx', language: 'tsx', size: 1_340, recommended: true },
  { path: 'src/theme.ts', language: 'ts', size: 980, recommended: false },
  { path: 'src/screens/VpnStepScreen.tsx', language: 'tsx', size: 3_120, recommended: true },
  { path: 'src/screens/OnboardingScreen.tsx', language: 'tsx', size: 1_860, recommended: false },
  { path: 'src/components/ConnectButton.tsx', language: 'tsx', size: 1_240, recommended: true },
  { path: 'src/components/StepRing.tsx', language: 'tsx', size: 1_680, recommended: true },
  { path: 'src/lib/vpn.ts', language: 'ts', size: 2_400, recommended: true },
  { path: 'src/lib/pedometer.ts', language: 'ts', size: 1_950, recommended: true },
  { path: 'src/lib/servers.ts', language: 'ts', size: 760, recommended: false },
  { path: 'src/styles/screen.css', language: 'css', size: 1_540, recommended: true },
  { path: 'README.md', language: 'markdown', size: 2_020, recommended: false },
]

export function recommendedFilePaths(): Set<string> {
  return new Set(
    MOCK_PROJECT_FILES.filter((file) => file.recommended).map((file) => file.path),
  )
}

export function formatFileSize(size: number): string {
  if (size < 1024) return `${size} Б`
  return `${(size / 1024).toFixed(1)} КБ`
}
