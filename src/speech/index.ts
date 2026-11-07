/**
 * Голосовой слой (этап 2): распознавание ru-RU, push-to-talk, озвучка.
 * Здесь только проверка поддержки и «характер» голоса, чтобы UI
 * заранее знал, показывать ли микрофон.
 */

export interface SpeechSupport {
  recognition: boolean
  synthesis: boolean
}

type SpeechWindow = Window & {
  SpeechRecognition?: unknown
  webkitSpeechRecognition?: unknown
}

export function detectSpeechSupport(): SpeechSupport {
  if (typeof window === 'undefined') {
    return { recognition: false, synthesis: false }
  }

  const speechWindow = window as SpeechWindow

  return {
    recognition:
      typeof speechWindow.SpeechRecognition === 'function' ||
      typeof speechWindow.webkitSpeechRecognition === 'function',
    synthesis: 'speechSynthesis' in window,
  }
}

/** Голос рыбки — спокойный и низкий; голос Колобка будет теплее. */
export const GOLDFISH_VOICE = {
  lang: 'ru-RU',
  pitch: 0.9,
  rate: 0.9,
} as const
