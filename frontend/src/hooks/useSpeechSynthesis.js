/**
 * useSpeechSynthesis.js
 * Wraps window.speechSynthesis for bilingual TTS alerts.

 */
import { useCallback } from 'react'

const synthesis = window.speechSynthesis

export function useSpeechSynthesis() {
  const isSupported = !!synthesis

  const speak = useCallback((text, lang = 'en') => {
    if (!isSupported || !text) return
    synthesis.cancel() // cancel any ongoing speech
    const utterance = new SpeechSynthesisUtterance(text)

    // Map our lang code to BCP-47
    const langCode = lang === 'hi' ? 'hi-IN' : 'en-IN'
    utterance.lang = langCode

    // Try to pick a matching voice
    const voices = synthesis.getVoices()
    const match = voices.find(v => v.lang === langCode)
      || voices.find(v => v.lang.startsWith(lang))
    if (match) utterance.voice = match

    utterance.rate = 0.92
    utterance.pitch = 1.05
    utterance.volume = 1.0
    synthesis.speak(utterance)
  }, [isSupported])

  const cancel = useCallback(() => {
    if (isSupported) synthesis.cancel()
  }, [isSupported])

  return { speak, cancel, isSupported }
}
