/**
 * CallSimulator.jsx — Phase 4 update
 * Three modes: Scripted demo (default) | Live mic (Web Speech API) | Whisper Mic (on-device ASR)
 *
 * Phase 4 additions:
 *  - "Whisper Mic" mode uses useWhisperASR hook for fully on-device transcription
 *  - onAudioChunk prop feeds raw audio to voice clone worker in App.jsx
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition.js'
import { useWhisperASR } from '../hooks/useWhisperASR.js'

// ── ARCHITECTURE.md §10 — 3 canned demo transcripts ─────────────────────────

export const DEMO_SCRIPTS = {
  digitalArrestHi: {
    label: { en: 'Digital Arrest Scam (Hindi)', hi: 'डिजिटल अरेस्ट स्कैम (हिंदी)' },
    lang: 'hi',
    text: `हेलो, नमस्ते। मैं इंस्पेक्टर राजेश कुमार, सीबीआई दिल्ली से बोल रहा हूं। आपके नाम एक बहुत गंभीर मामला दर्ज हुआ है। आपके आधार कार्ड से एक पार्सल भेजा गया था जिसमें ड्रग्स और जाली पासपोर्ट मिले हैं। यह एक गंभीर अपराध है और आपके खिलाफ वारंट जारी हो चुका है। आपको अभी गिरफ्तार किया जा सकता है। लेकिन अगर आप सहयोग करते हैं तो हम इसे सुलझा सकते हैं। यह बात किसी को मत बताना, यह गोपनीय जांच है। लाइन पर बने रहें और किसी को कॉल मत करें। आपको अभी एक सत्यापन शुल्क के रूप में पचास हजार रुपए सरकारी खाते में जमा करने होंगे। ओटीपी बताएं जो आपके फोन पर आया है। अगर अभी पैसे नहीं भेजे तो दस मिनट में पुलिस आपके घर आ जाएगी। यह आपका आखिरी मौका है, इस खाते में पैसे भेजें नहीं तो गिरफ्तारी होगी। आपको गिरफ्तार किया जाएगा और जेल भेजा जाएगा।`,
  },
  kycEnglish: {
    label: { en: 'Bank KYC / OTP Scam (English)', hi: 'बैंक केवाईसी / OTP स्कैम (अंग्रेज़ी)' },
    lang: 'en',
    text: `Hello, am I speaking with the account holder? This is calling from the National Bank Fraud Prevention Department. We have detected suspicious transactions on your account and it will be frozen within the next 10 minutes unless you verify your KYC right now. This is extremely urgent. You must act now to protect your funds. Do not hang up or your account will be immediately suspended. Please do not share this information with anyone else — this is a confidential investigation. Now, to re-verify your KYC, I need you to confirm your debit card number and the OTP that will be sent to your registered mobile number. Please share the OTP immediately — you have less than 5 minutes before your account is permanently deactivated. A warrant has been issued against suspicious activity linked to your account. Transfer your funds to this secure verification account right now, otherwise legal action will be taken against you.`,
  },
  benignEnglish: {
    label: { en: 'Benign Call — False Positive Check (English)', hi: 'सामान्य कॉल — गलत अलर्ट जांच' },
    lang: 'en',
    text: `Hey Priya, how are you doing? I was just calling to catch up. Oh, by the way, did you see that movie last night? The one where the detective issues a warrant to arrest the smuggler? Such an urgent plot, I couldn't stop watching. Anyway, I also wanted to ask — did you sort out that bank thing? I remember you mentioned updating your account details. No worries if it's not done yet, just checking in. The whole story about the courier getting intercepted by customs in that thriller was so gripping. Totally felt like they were going to freeze all his accounts. Ha! Anyway, hope you're doing well. Let's plan to meet this weekend if you're free. I'll text you the details. Talk soon!`,
  },
}

const UI = {
  title: { en: 'Call Simulator', hi: 'कॉल सिमुलेटर' },
  liveMode: { en: 'Live Mic', hi: 'लाइव माइक' },
  whisperMode: { en: '🎙 Whisper ASR', hi: '🎙 Whisper ASR' },
  scriptMode: { en: 'Scripted Demo', hi: 'स्क्रिप्टेड डेमो' },
  start: { en: '▶ Start Demo', hi: '▶ शुरू करें' },
  startLive: { en: '🎙 Start Live Mic', hi: '🎙 माइक शुरू करें' },
  startWhisper: { en: '🎙 Start Whisper ASR', hi: '🎙 Whisper शुरू करें' },
  stop: { en: '⏹ Stop', hi: '⏹ रोकें' },
  selectScript: { en: 'Select Demo Script', hi: 'डेमो स्क्रिप्ट चुनें' },
  noMic: { en: 'Speech recognition not available. Use Chrome or Edge.', hi: 'स्पीच रेकग्निशन उपलब्ध नहीं। Chrome या Edge उपयोग करें।' },
  callActive: { en: 'Call in progress', hi: 'कॉल जारी है' },
  speakNow: { en: '🎙 Speak now — Raksha is listening for scam signals in your mic', hi: '🎙 अभी बोलें — राक्षा आपके माइक में स्कैम संकेत सुन रही है' },
  whisperListening: { en: '🧠 On-device Whisper ASR is transcribing your voice…', hi: '🧠 ऑन-डिवाइस Whisper ASR आपकी आवाज़ ट्रांसक्राइब कर रहा है…' },
  whisperLoading: { en: 'Loading Whisper model…', hi: 'Whisper मॉडल लोड हो रहा है…' },
  progress: { en: 'Playing transcript', hi: 'ट्रांसक्रिप्ट चल रहा है' },
  whisperNote: {
    en: 'On-device Whisper: audio never leaves your browser. Supports Hindi, English & Hinglish.',
    hi: 'ऑन-डिवाइस Whisper: ऑडियो ब्राउज़र से बाहर नहीं जाता। Hindi, English और Hinglish सपोर्ट।',
  },
}

export default function CallSimulator({ lang, onTranscriptUpdate, onCallStart, onCallStop, onAudioChunk, voiceCloneWorkerReady }) {
  const [mode, setMode] = useState('script')
  const [selectedScript, setSelectedScript] = useState('digitalArrestHi')
  const [isRunning, setIsRunning] = useState(false)
  const [wordCount, setWordCount] = useState(0)
  const [totalWords, setTotalWords] = useState(0)

  // ── Refs to avoid stale closures in setInterval ───────────────────────────
  const playbackRef = useRef(null)
  const wordIndexRef = useRef(0)
  const accumulatedRef = useRef('')
  const onTranscriptUpdateRef = useRef(onTranscriptUpdate)
  const onCallStopRef = useRef(onCallStop)
  const isRunningRef = useRef(false)

  useEffect(() => { onTranscriptUpdateRef.current = onTranscriptUpdate }, [onTranscriptUpdate])
  useEffect(() => { onCallStopRef.current = onCallStop }, [onCallStop])
  useEffect(() => { isRunningRef.current = isRunning }, [isRunning])

  // ── Web Speech API (original live mic) ───────────────────────────────────
  const { transcript: micTranscript, isListening, isSupported, start: startMic, stop: stopMic, reset: resetMic } = useSpeechRecognition(
    lang === 'hi' ? 'hi-IN' : 'en-IN'
  )

  // ── Phase 4: Whisper ASR hook ─────────────────────────────────────────────
  const {
    transcript: whisperTranscript,
    isListening: whisperListening,
    workerStatus: whisperStatus,
    workerProgress: whisperProgress,
    volume: whisperVolume,
    micError: whisperError,
    start: startWhisper,
    stop: stopWhisper,
    reset: resetWhisper,
  } = useWhisperASR(lang)

  // Forward live mic transcript to parent
  useEffect(() => {
    if (mode === 'live' && isRunning && micTranscript) {
      onTranscriptUpdateRef.current(micTranscript)
    }
  }, [micTranscript, mode, isRunning])

  // Forward Whisper transcript to parent
  useEffect(() => {
    if (mode === 'whisper' && isRunning && whisperTranscript) {
      onTranscriptUpdateRef.current(whisperTranscript)
    }
  }, [whisperTranscript, mode, isRunning])

  // ── Scripted playback ─────────────────────────────────────────────────────
  const handleAudioChunk = useCallback((float32Audio) => {
    if (!isRunning) return
    // Send to voice clone worker for analysis via App.jsx
    onAudioChunk?.(float32Audio)
  }, [isRunning, onAudioChunk])

  // Expose to window so useWhisperASR can access it
  useEffect(() => {
    window.dispatchAudioChunk = handleAudioChunk
    return () => {
      delete window.dispatchAudioChunk
    }
  }, [handleAudioChunk])

  const stopPlayback = useCallback(() => {
    if (playbackRef.current) {
      clearInterval(playbackRef.current)
      playbackRef.current = null
    }
    wordIndexRef.current = 0
    accumulatedRef.current = ''
    setIsRunning(false)
    setWordCount(0)
    isRunningRef.current = false
    onCallStopRef.current?.()
  }, [])

  const startScriptedPlayback = useCallback(() => {
    if (playbackRef.current) {
      clearInterval(playbackRef.current)
      playbackRef.current = null
    }
    const script = DEMO_SCRIPTS[selectedScript]
    const words = script.text.split(/\s+/).filter(Boolean)
    wordIndexRef.current = 0
    accumulatedRef.current = ''
    setTotalWords(words.length)
    setWordCount(0)
    onCallStart?.()
    setIsRunning(true)
    isRunningRef.current = true

    const firstChunk = words.slice(0, 3).join(' ')
    accumulatedRef.current = firstChunk
    wordIndexRef.current = 3
    setWordCount(3)
    onTranscriptUpdateRef.current(firstChunk)

    playbackRef.current = setInterval(() => {
      if (!isRunningRef.current || wordIndexRef.current >= words.length) {
        clearInterval(playbackRef.current)
        playbackRef.current = null
        setIsRunning(false)
        isRunningRef.current = false
        onCallStopRef.current?.()
        return
      }
      const nextIdx = Math.min(wordIndexRef.current + 2, words.length)
      const chunk = words.slice(wordIndexRef.current, nextIdx).join(' ')
      accumulatedRef.current = accumulatedRef.current + ' ' + chunk
      wordIndexRef.current = nextIdx
      setWordCount(nextIdx)
      onTranscriptUpdateRef.current(accumulatedRef.current.trim())
    }, 850)
  }, [selectedScript, onCallStart])

  const handleStart = () => {
    if (mode === 'live') {
      resetMic()
      onCallStart?.()
      startMic()
      setIsRunning(true)
    } else if (mode === 'whisper') {
      resetWhisper()
      onCallStart?.()
      // startWhisper handles isListening independently if it fails,
      // but we optimistically set isRunning unless there's an immediate fail
      startWhisper()
      setIsRunning(true)
    } else {
      startScriptedPlayback()
    }
  }

  const handleStop = () => {
    if (mode === 'live') {
      stopMic()
      onCallStop?.()
      setIsRunning(false)
    } else if (mode === 'whisper') {
      stopWhisper()
      onCallStop?.()
      setIsRunning(false)
    } else {
      stopPlayback()
    }
  }

  const progress = totalWords > 0 ? Math.round((wordCount / totalWords) * 100) : 0
  const whisperReady = whisperStatus === 'ready'
  const whisperLoading = whisperStatus === 'loading'

  return (
    <div className="card-framer flex flex-col h-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[22px] font-bold text-white heading-framer flex items-center gap-3">
          <span className="text-2xl text-white/80">📞</span>
          {UI.title[lang]}
        </h2>
        {isRunning && (
          <span className="flex items-center gap-2 text-[11px] font-bold text-emerald-400 tracking-widest uppercase bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            {UI.callActive[lang]}
          </span>
        )}
      </div>

      {/* Mode switcher — 3 pills: Script | Live | Whisper */}
      <div className="flex gap-2 p-1.5 bg-white/5 backdrop-blur-md rounded-full border border-white/5 w-fit flex-wrap">
        {[
          ['script', UI.scriptMode[lang]],
          ['live', UI.liveMode[lang]],
          ['whisper', UI.whisperMode[lang]],
        ].map(([m, label]) => (
          <button
            key={m}
            id={`mode-${m}`}
            disabled={isRunning}
            onClick={() => setMode(m)}
            className={`px-5 py-2.5 text-[13px] font-bold rounded-full transition-all duration-500 disabled:opacity-40 ${
              mode === m
                ? m === 'whisper'
                  ? 'bg-fuchsia-500 text-white shadow-[0_4px_12px_rgba(217,70,239,0.3)]'
                  : 'bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.2)]'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Script selector */}
      {mode === 'script' && !isRunning && (
        <div className="space-y-4">
          <label className="text-[11px] font-bold text-white/40 uppercase tracking-[0.2em]">
            {UI.selectScript[lang]}
          </label>
          <div className="space-y-3">
            {Object.entries(DEMO_SCRIPTS).map(([key, script]) => (
              <button
                key={key}
                id={`script-${key}`}
                onClick={() => setSelectedScript(key)}
                className={`script-btn ${selectedScript === key ? 'script-btn-active' : ''}`}
              >
                <div className="flex justify-between items-center w-full">
                  <span className={`${selectedScript === key ? 'text-white' : 'text-white/70'} transition-colors duration-300`}>{script.label[lang]}</span>
                  <span className={`badge-framer ${key === 'benignEnglish' ? 'badge-emerald' : 'badge-rose'}`}>
                    {key === 'benignEnglish' ? (lang === 'en' ? 'Safe' : 'सुरक्षित') : (lang === 'en' ? 'Scam Target' : 'स्कैम')}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Whisper mode info when not running */}
      {mode === 'whisper' && !isRunning && (
        <div className="space-y-3 p-5 rounded-[20px] bg-fuchsia-500/5 border border-fuchsia-500/20">
          <div className="flex items-center gap-2.5">
            <span className={`w-2 h-2 rounded-full ${whisperReady ? 'bg-emerald-400' : whisperLoading ? 'bg-amber-400 animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[13px] font-semibold text-white/80">
              {whisperLoading
                ? `${UI.whisperLoading[lang]} ${whisperProgress > 0 ? `(${whisperProgress}%)` : ''}`
                : whisperReady ? 'Whisper tiny · Ready' : 'Initializing…'}
            </span>
          </div>
          <p className="text-[12px] text-fuchsia-200/60 leading-relaxed">
            {UI.whisperNote[lang]}
          </p>
          {whisperLoading && whisperProgress > 0 && (
            <div className="h-1 bg-black/30 rounded-full overflow-hidden">
              <div className="h-full bg-fuchsia-500 transition-all duration-500" style={{ width: `${whisperProgress}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Whisper mode Error */}
      {mode === 'whisper' && whisperError && (
        <div className="space-y-3 p-5 rounded-[20px] bg-red-500/10 border border-red-500/30">
          <p className="text-[13px] font-bold text-red-400">⚠ Microphone Error</p>
          <p className="text-[12px] text-red-200/80">{whisperError}</p>
        </div>
      )}

      {/* Script progress bar */}
      {mode === 'script' && isRunning && (
        <div className="space-y-4 p-6 rounded-[24px] bg-white/5 border border-white/5 flex-1 flex flex-col justify-center">
          <div className="flex justify-between text-[11px] font-bold text-white/50 tracking-[0.2em] uppercase">
            <span>{UI.progress[lang]}</span>
            <span className="text-white">{progress}%</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-white relative transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/50 animate-pulse"></div>
            </div>
          </div>
          <p className="text-[13px] text-white/70 text-center font-medium">
            {DEMO_SCRIPTS[selectedScript].label[lang]}
          </p>
        </div>
      )}

      {/* Live mic instruction */}
      {mode === 'live' && isRunning && (
        <div className="flex-1 flex flex-col items-center justify-center bg-emerald-500/5 border border-emerald-500/20 rounded-[24px] p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1)_0%,transparent_70%)] animate-pulse"></div>
          <span className="text-4xl mb-4 animate-bounce">🎙</span>
          <p className="text-emerald-400 text-sm font-semibold tracking-wide relative z-10">
            {UI.speakNow[lang]}
          </p>
        </div>
      )}

      {/* Whisper ASR instruction */}
      {mode === 'whisper' && isRunning && (
        <div className="flex-1 flex flex-col items-center justify-center bg-fuchsia-500/5 border border-fuchsia-500/20 rounded-[24px] p-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(217,70,239,0.1)_0%,transparent_70%)] animate-pulse"></div>
          <span className="text-4xl mb-4">🧠</span>
          <p className="text-fuchsia-300 text-sm font-semibold tracking-wide relative z-10 text-center">
            {UI.whisperListening[lang]}
          </p>
          {/* Volume Indicator */}
          <div className="mt-4 flex items-center justify-center gap-2 relative z-10 w-full max-w-[200px]">
            <span className="text-[10px] font-bold text-fuchsia-400/70 uppercase">Vol</span>
            <div className="h-1.5 flex-1 bg-black/40 rounded-full overflow-hidden border border-fuchsia-500/20">
              <div 
                className="h-full bg-fuchsia-400 transition-all duration-75"
                style={{ width: `${Math.min(100, whisperVolume)}%` }}
              />
            </div>
          </div>
          {voiceCloneWorkerReady && (
            <p className="text-[11px] text-fuchsia-300/50 mt-2 relative z-10">
              + Voice-clone detector active
            </p>
          )}
        </div>
      )}

      {/* Mic unsupported warning */}
      {mode === 'live' && !isSupported && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-amber-400 text-[13px] bg-amber-500/10 rounded-2xl px-6 py-4 border border-amber-500/20 text-center">
            ⚠ {UI.noMic[lang]}
          </p>
        </div>
      )}

      {/* Start/Stop */}
      <div className="mt-auto pt-4">
        <button
          id={isRunning ? 'call-stop-btn' : 'call-start-btn'}
          onClick={isRunning ? handleStop : handleStart}
          disabled={
            (mode === 'live' && !isSupported) ||
            (mode === 'whisper' && !whisperReady && !isRunning)
          }
          className={`w-full py-4 rounded-full font-bold text-[15px] transition-all duration-500 disabled:opacity-40 shadow-xl ${
            isRunning
              ? 'bg-[#e11d48] text-white hover:bg-[#be123c] shadow-[#e11d48]/20'
              : mode === 'whisper'
                ? 'bg-fuchsia-500 text-white hover:bg-fuchsia-600 shadow-fuchsia-500/20'
                : 'bg-white text-black hover:bg-gray-200 shadow-white/10'
          }`}
        >
          {isRunning
            ? UI.stop[lang]
            : mode === 'live'
              ? UI.startLive[lang]
              : mode === 'whisper'
                ? UI.startWhisper[lang]
                : UI.start[lang]}
        </button>
      </div>
    </div>
  )
}
