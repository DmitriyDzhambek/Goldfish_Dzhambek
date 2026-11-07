export type CharacterId = 'fish' | 'kolobok'

export interface CharacterMeta {
  id: CharacterId
  name: string
  short: string
  emoji: string
  lead: string
}

/**
 * Персонаж — это не отдельное приложение, а смена настроения сцены.
 * Тексты и палитра живут здесь, чтобы не расползались по компонентам.
 */
export const CHARACTERS: Record<CharacterId, CharacterMeta> = {
  fish: {
    id: 'fish',
    name: 'Золотая рыбка',
    short: 'Рыбка',
    emoji: '🐠',
    lead: 'Чего изволите? Скажи желание — я разложу его на шаги и помогу дойти до конца.',
  },
  kolobok: {
    id: 'kolobok',
    name: 'Колобок',
    short: 'Колобок',
    emoji: '🥐',
    lead: 'Я от дедушки ушёл, я от бабушки ушёл — и к тебе прикатился, чтобы помочь с делами.',
  },
}

export function isCharacterId(value: string | null): value is CharacterId {
  return value === 'fish' || value === 'kolobok'
}
