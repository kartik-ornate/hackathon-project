/**
 * useWhisperASR.js — Phase 4 Task 1: Hook for on-device Whisper ASR
 *
 * Replaces / augments useSpeechRecognition.js for the "Whisper Mic" mode.
 * Captures mic audio via AudioContext, resamples to 16kHz Float32Array chunks,
 * and ships them to whisper.worker.js for transcription.
 *
 * Audio never leaves the browser — this is the true on-device ASR path
 * described in ARCHITECTURE.md §1, closing the #1 integrity gap.
 */
import { useState, useRef, useCallback, useEffect } from 'react'

// Whisper expects 16kHz mono audio
const TARGET_SAMPLE_RATE = 16000
// Collect ~3s of audio before sending a chunk (balances latency vs. accuracy)
const CHUNK_DURATION_S = 3
// Maximum accumulated transcript to keep in memory
const MAX_TRANSCRIPT_WORDS = 300

export function useWhisperASR(lang = 'en') {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [workerStatus, setWorkerStatus] = useState('idle') // idle | loading | ready | error
  const [workerProgress, setWorkerProgress] = useState(0)
  const [workerDevice, setWorkerDevice] = useState(null)

  const workerRef = useRef(null)
  const streamRef = useRef(null)
  const audioCtxRef = useRef(null)
  const processorRef = useRef(null)
  const accumulatedSamplesRef = useRef([])
  const fullTranscriptRef = useRef('')
  const langRef = useRef(lang)
  const chunkIdRef = useRef(0)

  useEffect(() => { langRef.current = lang }, [lang])

  // Initialize the Whisper worker once
  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/whisper.worker.js', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (event) => {
      const { type, data, text, device, error } = event.data

      if (type === 'progress') {
        if (data?.status === 'progress' && typeof data.progress === 'number') {
          setWorkerProgress(Math.round(data.progress))
        }
        if (data?.status === 'initiate') setWorkerStatus('loading')
      } else if (type === 'ready') {
        setWorkerStatus('ready')
        setWorkerProgress(100)
        if (device) setWorkerDevice(device)
      } else if (type === 'transcript') {
        if (text && text.length > 0) {
          // Append new text, avoiding exact duplicates from overlapping windows
          const prev = fullTranscriptRef.current
          const newText = text.startsWith(prev.slice(-20)) ? text.slice(20) : text
          const combined = prev ? prev + ' ' + newText : newText
          // Trim to max words
          const words = combined.split(/\s+/).filter(Boolean)
          const trimmed = words.slice(-MAX_TRANSCRIPT_WORDS).join(' ')
          fullTranscriptRef.current = trimmed
          setTranscript(trimmed)
        }
      } else if (type === 'error') {
        console.error('[WhisperASR] Worker error:', error)
        setWorkerStatus('error')
      }
    }

    workerRef.current = worker
    setWorkerStatus('loading')
    worker.postMessage({ type: 'init' })

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const stopListening = useCallback(() => {
    // Stop the audio stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // Disconnect AudioContext nodes
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    accumulatedSamplesRef.current = []
    setIsListening(false)
  }, [])

  const startListening = useCallback(async () => {
    if (workerStatus !== 'ready') {
      console.warn('[WhisperASR] Worker not ready yet')
      return
    }
    try {
      // Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: TARGET_SAMPLE_RATE },
        video: false,
      })
      streamRef.current = stream

      // Create AudioContext at the native sample rate (we'll resample in the processor)
      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx

      const source = audioCtx.createMediaStreamSource(stream)

      // Use ScriptProcessor (widely supported) for raw PCM capture
      // Buffer size 4096 at 44100Hz ≈ 93ms per callback
      const bufferSize = 4096
      const processor = audioCtx.createScriptProcessor(bufferSize, 1, 1)
      processorRef.current = processor

      const nativeSR = audioCtx.sampleRate
      const chunkSamples = TARGET_SAMPLE_RATE * CHUNK_DURATION_S

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)

        // Downsample from native SR to 16kHz
        const ratio = TARGET_SAMPLE_RATE / nativeSR
        const outputLength = Math.round(inputData.length * ratio)
        const resampled = new Float32Array(outputLength)
        for (let i = 0; i < outputLength; i++) {
          resampled[i] = inputData[Math.round(i / ratio)] ?? 0
        }

        // Accumulate
        accumulatedSamplesRef.current.push(...resampled)

        // When we have enough for a chunk, send to worker
        if (accumulatedSamplesRef.current.length >= chunkSamples) {
          const chunk = new Float32Array(accumulatedSamplesRef.current.splice(0, chunkSamples))
          const id = ++chunkIdRef.current
          workerRef.current?.postMessage(
            { type: 'transcribe', id, audio: chunk, lang: langRef.current },
            [chunk.buffer]
          )
        }
      }

      source.connect(processor)
      processor.connect(audioCtx.destination)

      setIsListening(true)
    } catch (err) {
      console.error('[WhisperASR] Failed to start mic:', err)
      setWorkerStatus('error')
    }
  }, [workerStatus])

  const reset = useCallback(() => {
    fullTranscriptRef.current = ''
    accumulatedSamplesRef.current = []
    setTranscript('')
  }, [])

  return {
    transcript,
    isListening,
    workerStatus,
    workerProgress,
    workerDevice,
    start: startListening,
    stop: stopListening,
    reset,
  }
}
