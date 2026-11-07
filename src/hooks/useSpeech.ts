import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readStorage, writeStorage } from '../lib/storage'
import { detectSpeechSupport, GOLDFISH_VOICE, toPlainSpeech } from '../speech'

interface SpeechAlternative {
  transcript: string
}

interface SpeechResult {
  isFinal: boolean
  length: number
  [index: number]: SpeechAlternative
}

interface SpeechResultList {
  length: number
  [index: number]: SpeechResult
}

interface SpeechResultEvent extends Event {
  resultIndex: number
  results: SpeechResultList
}

interface SpeechErrorEvent extends Event {
  error: string
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onstart: (() => void) | null
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const VOICE_KEY = 'zr:voice'

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Разреши доступ к микрофону в настройках браузера.',
  'audio-capture': 'Микрофон не найден. Проверь, что он подключён.',
  'network': 'Распознавание речи требует соединения. Попробуй ещё раз.',
  'no-speech': 'Я не расслышала. Попробуй сказать чуть ближе к микрофону.',
  'aborted': '',
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as SpeechWindow
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

function pickRussianVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const russian = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ru'))
  const preferred = russian.find((voice) =>
    /milena|google|irina|anna|alena|yuri|dmitri/i.test(voice.name),
  )

  return preferred ?? russian[0] ?? null
}

export interface UseSpeechOptions {
  onTranscript?: (text: string) => void
}

export interface SpeechController {
  supported: { recognition: boolean; synthesis: boolean }
  listening: boolean
  speaking: boolean
  interim: string
  error: string | null
  voiceEnabled: boolean
  toggleListening: () => void
  stopListening: () => void
  speak: (text: string) => void
  stopSpeaking: () => void
  toggleVoice: () => void
  clearError: () => void
}

/**
 * Голосовой слой: распознавание ru-RU и озвучка спокойным голосом.
 * Всё через Web Speech API — без серверных ключей и загрузок.
 */
export function useSpeech({ onTranscript }: UseSpeechOptions = {}): SpeechController {
  const supported = useMemo(detectSpeechSupport, [])
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [voiceEnabled, setVoiceEnabled] = useState(() => readStorage(VOICE_KEY, '0') === '1')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    writeStorage(VOICE_KEY, voiceEnabled ? '1' : '0')
  }, [voiceEnabled])

  useEffect(() => {
    if (!supported.synthesis || typeof window === 'undefined') return

    const synth = window.speechSynthesis
    const update = () => setVoices(synth.getVoices())

    update()
    synth.addEventListener('voiceschanged', update)
    return () => synth.removeEventListener('voiceschanged', update)
  }, [supported.synthesis])

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort()
      recognitionRef.current = null
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const stopListening = useCallback((): void => {
    recognitionRef.current?.stop()
  }, [])

  const toggleListening = useCallback((): void => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      return
    }

    const Constructor = getRecognitionConstructor()
    if (!Constructor) {
      setError('Этот браузер не умеет распознавать речь. Попробуй Chrome или Edge.')
      return
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      setSpeaking(false)
    }

    const recognition = new Constructor()
    recognition.lang = GOLDFISH_VOICE.lang
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      setListening(true)
      setError(null)
      setInterim('')
    }

    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (!result) continue
        const alternative = result[0]
        if (!alternative) continue

        if (result.isFinal) finalText += alternative.transcript
        else interimText += alternative.transcript
      }

      setInterim(interimText)
      if (finalText.trim()) {
        onTranscriptRef.current?.(finalText.trim())
        setInterim('')
      }
    }

    recognition.onerror = (event) => {
      const message = RECOGNITION_ERRORS[event.error] ?? 'Не удалось распознать речь. Попробуй ещё раз.'
      if (message) setError(message)
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
      recognitionRef.current = null
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      setError('Микрофон уже занят другим приложением.')
    }
  }, [])

  const speak = useCallback(
    (text: string): void => {
      if (!supported.synthesis || typeof window === 'undefined') return

      const plain = toPlainSpeech(text)
      if (!plain) return

      const synth = window.speechSynthesis
      synth.cancel()

      const utterance = new SpeechSynthesisUtterance(plain)
      utterance.lang = GOLDFISH_VOICE.lang
      utterance.pitch = GOLDFISH_VOICE.pitch
      utterance.rate = GOLDFISH_VOICE.rate
      utterance.volume = 1

      const voice = pickRussianVoice(voices)
      if (voice) utterance.voice = voice

      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => setSpeaking(false)
      utterance.onerror = () => setSpeaking(false)

      synth.speak(utterance)
    },
    [supported.synthesis, voices],
  )

  const stopSpeaking = useCallback((): void => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const toggleVoice = useCallback((): void => {
    setVoiceEnabled((enabled) => {
      if (enabled) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
        setSpeaking(false)
      }
      return !enabled
    })
  }, [])

  const clearError = useCallback((): void => setError(null), [])

  return {
    supported,
    listening,
    speaking,
    interim,
    error,
    voiceEnabled,
    toggleListening,
    stopListening,
    speak,
    stopSpeaking,
    toggleVoice,
    clearError,
  }
}
