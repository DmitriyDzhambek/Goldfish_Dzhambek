/**
 * Голосовой ввод идеи: иконка микрофона внутри большого поля.
 * Распознавание — Web Speech API, язык ru-RU, всё локально в браузере.
 */

import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useSpeech } from '../../hooks/useSpeech'
import styles from './VoiceInput.module.css'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export function VoiceInput({ onTranscript, disabled = false }: VoiceInputProps) {
  const [interim, setInterim] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  const speech = useSpeech({
    onTranscript: (text) => {
      setInterim('')
      onTranscriptRef.current(text)
    },
  })

  // Промежуточный текст распознавания показываем сразу — живой фидбек.
  useEffect(() => {
    setInterim(speech.interim)
  }, [speech.interim])

  useEffect(() => {
    setHint(speech.error)
  }, [speech.error])

  if (!speech.supported.recognition) {
    return (
      <span className={styles.wrap} title="Распознавание речи недоступно в этом браузере">
        <MicOff className={styles.micOff} size={18} strokeWidth={1.8} aria-hidden="true" />
      </span>
    )
  }

  return (
    <span className={styles.wrap}>
      {interim && <span className={styles.interim}>{interim}</span>}
      {hint && (
        <span className={styles.hint} role="status">
          {hint}
        </span>
      )}
      <button
        type="button"
        className={[styles.mic, speech.listening && styles.listening].filter(Boolean).join(' ')}
        onClick={speech.toggleListening}
        disabled={disabled}
        aria-pressed={speech.listening}
        aria-label={speech.listening ? 'Остановить диктовку' : 'Продиктовать идею'}
        title={speech.listening ? 'Слушаю… нажмите, чтобы остановить' : 'Продиктовать идею'}
      >
        <Mic size={18} strokeWidth={1.8} aria-hidden="true" />
        {speech.listening && <span className={styles.pulse} aria-hidden="true" />}
      </button>
    </span>
  )
}
