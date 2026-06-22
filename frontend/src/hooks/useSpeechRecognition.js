/**
 * useSpeechRecognition.js
 * Wraps the browser Web Speech API (continuous, interimResults).

 */
import { useState, useRef, useCallback, useEffect } from 'react'

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

export function useSpeechRecognition(lang = 'en-IN') {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isSupported] = useState(() => !!SpeechRecognition)
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  useEffect(() => {
    if (!isSupported) return
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onresult = (event) => {
      let interim = ''
      let finalDelta = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalDelta += text + ' '
        } else {
          interim += text
        }
      }
      if (finalDelta) {
        finalTranscriptRef.current += finalDelta
      }
      setTranscript(finalTranscriptRef.current + interim)
    }

    recognition.onerror = (e) => {
      console.warn('SpeechRecognition error:', e.error)
      if (e.error === 'not-allowed') setIsListening(false)
    }

    recognition.onend = () => {
      // Auto-restart if still supposed to be listening
      if (recognitionRef.current && recognitionRef.current._shouldRun) {
        recognition.start()
      } else {
        setIsListening(false)
      }
    }

    recognitionRef.current = recognition
    recognitionRef.current._shouldRun = false
    return () => {
      recognition.abort()
    }
  }, [isSupported, lang])

  const start = useCallback(() => {
    if (!isSupported || !recognitionRef.current) return
    finalTranscriptRef.current = ''
    setTranscript('')
    recognitionRef.current._shouldRun = true
    recognitionRef.current.start()
    setIsListening(true)
  }, [isSupported])

  const stop = useCallback(() => {
    if (!recognitionRef.current) return
    recognitionRef.current._shouldRun = false
    recognitionRef.current.stop()
    setIsListening(false)
  }, [])

  const reset = useCallback(() => {
    finalTranscriptRef.current = ''
    setTranscript('')
  }, [])

  return { transcript, isListening, isSupported, start, stop, reset }
}
