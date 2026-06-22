/**
 * App.jsx — Raksha Web Demo (Phase 4)
 *
 * Phase 4 additions:
 *   1. On-device Whisper ASR  — whisper.worker.js replaces Web Speech API when
 *      "Whisper Mic" mode is selected in CallSimulator.
 *   2. Fully-offline WebLLM  — llm.worker.js runs Gemma-2B-IT in-browser via
 *      WebGPU; when "Offline Mode" is toggled, Tier-2 socket calls are replaced
 *      by local LLM inference — works with no network at all.
 *   3. Voice-Clone 6th signal — voiceClone.worker.js runs concurrently with
 *      Whisper to detect AI-synthesized speech; injects voice_clone into signals.
 *
 * State: call lifecycle = XState `callMachine`; all data = Zustand `useRakshaStore`.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { io } from 'socket.io-client'
import { useMachine } from '@xstate/react'
import LanguageToggle from './components/LanguageToggle.jsx'
import CallSimulator from './components/CallSimulator.jsx'
import LiveTranscript from './components/LiveTranscript.jsx'
import RiskMeter from './components/RiskMeter.jsx'
import ScamAlertOverlay from './components/ScamAlertOverlay.jsx'
import SafeWordSetup from './components/SafeWordSetup.jsx'
import ModelLoadingScreen from './components/ModelLoadingScreen.jsx'
import SignalPanel from './components/SignalPanel.jsx'
import PipelineViz from './components/PipelineViz.jsx'
import OfflineModePanel from './components/OfflineModePanel.jsx'
import { scoreRisk } from './services/riskScorer.js'
import { callMachine } from './state/callMachine.js'
import { useRakshaStore } from './state/useRakshaStore.js'

const TRANSCRIPT_WINDOW_WORDS = 100

const UI = {
  title: { en: 'Raksha', hi: 'राक्षा' },
  tagline: { en: 'Real-Time Scam Shield', hi: 'रियल-टाइम स्कैम शील्ड' },
  demoBadge: { en: 'ZERO CLOUD', hi: 'ज़ीरो क्लाउड' },
  demoNote: {
    en: 'Phase 4: A multilingual sentence-embedding model + Whisper ASR + Voice-Clone detector all run entirely in your browser (WebGPU/WASM). Enable Offline Mode to swap Tier-2 cloud reasoning for on-device Gemma-2B-IT — the backend can be completely disconnected.',
    hi: 'फेज़ 4: मल्टीलिंगुअल एम्बेडिंग + Whisper ASR + वॉइस-क्लोन डिटेक्टर सब ब्राउज़र में चलते हैं (WebGPU/WASM)। ऑफलाइन मोड चालू करें — बैकएंड बिल्कुल बंद होने पर भी Gemma-2B काम करता है।',
  },
  settings: { en: 'Settings', hi: 'सेटिंग्स' },
  analyzing: { en: 'Cloud Reasoner Active...', hi: 'क्लाउड रीज़नर सक्रिय...' },
  analyzingOffline: { en: 'On-Device LLM Reasoning...', hi: 'ऑन-डिवाइस LLM सक्रिय...' },
  offlineMode: { en: 'Offline Mode', hi: 'ऑफलाइन मोड' },
  voiceCloneActive: { en: '🎭 Voice Clone Detected!', hi: '🎭 AI आवाज़ क्लोन!' },
}

export default function App() {
  const [lang, setLang] = useState('en')
  const [transcript, setTranscript] = useState('')
  const [safeWord, setSafeWord] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showDemoNote, setShowDemoNote] = useState(false)
  const [workerStatus, setWorkerStatus] = useState('Initializing local model...')
  const [modelProgress, setModelProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  // ── Phase 4: Offline / WebLLM state ─────────────────────────────────────────
  const [offlineMode, setOfflineMode] = useState(false)
  const [llmStatus, setLlmStatus] = useState('idle')  // idle | loading | ready | error
  const [llmProgress, setLlmProgress] = useState(0)
  const [llmProgressText, setLlmProgressText] = useState('')
  const [llmModel, setLlmModel] = useState(null)
  const llmWorkerRef = useRef(null)
  const llmRequestIdRef = useRef(0)

  // ── Phase 4: Voice Clone state ───────────────────────────────────────────────
  const [voiceCloneWorkerStatus, setVoiceCloneWorkerStatus] = useState('idle')
  const voiceCloneWorkerRef = useRef(null)
  const voiceCloneAudioBufferRef = useRef([])  // audio chunks queued for analysis

  // Call lifecycle FSM
  const [callState, send] = useMachine(callMachine)
  const callValue = callState.value
  const callActive = callValue === 'active' || callValue === 'warn' || callValue === 'block'
  const showAlert = callValue === 'warn' || callValue === 'block'

  // Data store
  const riskScore = useRakshaStore((s) => s.riskScore)
  const action = useRakshaStore((s) => s.action)
  const signals = useRakshaStore((s) => s.signals)
  const advisories = useRakshaStore((s) => s.advisories)
  const alertText = useRakshaStore((s) => s.alertText)
  const analyzing = useRakshaStore((s) => s.analyzing)
  const error = useRakshaStore((s) => s.error)
  const modelDevice = useRakshaStore((s) => s.modelDevice)

  const workerRef = useRef(null)
  const socketRef = useRef(null)
  const sessionIdRef = useRef(null)
  const elapsedSecondsRef = useRef(0)
  const elapsedTimerRef = useRef(null)
  const lastAnalyzedTranscript = useRef('')
  const transcriptRef = useRef('')
  const langRef = useRef(lang)
  const sendRef = useRef(send)
  const offlineModeRef = useRef(offlineMode)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { langRef.current = lang }, [lang])
  useEffect(() => { sendRef.current = send }, [send])
  useEffect(() => { offlineModeRef.current = offlineMode }, [offlineMode])

  // ── Phase 4: Offline Tier-2 via WebLLM ──────────────────────────────────────
  const runOfflineTier2 = useCallback((signals, transcriptWindow, elapsedSecs) => {
    if (!llmWorkerRef.current || llmStatus !== 'ready') return
    const store = useRakshaStore.getState()
    if (store.analyzing) return

    store.pipelineStart({ nodes: ['retrieve_offline', 'reason_offline', 'score'] })
    const id = ++llmRequestIdRef.current

    llmWorkerRef.current.postMessage({
      type: 'reason',
      id,
      signals,
      transcriptWindow,
      lang: langRef.current,
      retrievedAdvisories: store.advisories,
    })
  }, [llmStatus])

  // ── Tier-1 result handler ────────────────────────────────────────────────────
  const handleLocalSignals = useCallback((newSignals) => {
    const store = useRakshaStore.getState()
    const elapsed = elapsedSecondsRef.current
    const { riskScore: rs, action: act } = scoreRisk(newSignals, elapsed)
    store.applyLocalResult({ signals: newSignals, riskScore: rs, action: act })
    sendRef.current({ type: 'RISK', action: act, riskScore: rs })

    // Tier-2: stream the LangGraph only on warn/block, not while one is already running
    if ((act === 'warn' || act === 'block') && !store.analyzing) {
      if (offlineModeRef.current) {
        // Phase 4 Task 2: use on-device WebLLM instead of backend socket
        runOfflineTier2(newSignals, lastAnalyzedTranscript.current, elapsed)
      } else {
        store.pipelineStart({})
        socketRef.current?.emit('analyze_stream', {
          sessionId: sessionIdRef.current,
          transcriptWindow: lastAnalyzedTranscript.current,
          lang: langRef.current,
          signals: newSignals,
          elapsedSeconds: elapsed,
        })
      }
    }
  }, [runOfflineTier2])

  // ── Initialize Tier-1 classifier Worker + WebSocket ─────────────────────────
  useEffect(() => {
    const store = useRakshaStore.getState()

    workerRef.current = new Worker(new URL('./workers/classifier.worker.js', import.meta.url), { type: 'module' })
    workerRef.current.onmessage = (event) => {
      const { type, data, signals: sig, error: err, device } = event.data
      if (type === 'ready') {
        setWorkerStatus('ready')
        setModelProgress(100)
        if (device) store.setModelDevice(device)
      } else if (type === 'progress') {
        if (data.status === 'initiate') setWorkerStatus(`Initiating download: ${data.file}`)
        else if (data.status === 'download') setWorkerStatus(`Downloading ${data.file}...`)
        else if (data.status === 'progress') {
          setWorkerStatus(`Downloading ${data.file}`)
          if (typeof data.progress === 'number') setModelProgress(data.progress)
        } else if (data.status === 'done') setWorkerStatus(`Loaded ${data.file}`)
      } else if (type === 'result') {
        handleLocalSignals(sig)
      } else if (type === 'error') {
        store.setError('Local classifier error: ' + err)
      }
    }
    workerRef.current.postMessage({ type: 'init' })

    socketRef.current = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:4000')
    const s = socketRef.current
    s.on('pipeline_start', (d) => useRakshaStore.getState().pipelineStart(d))
    s.on('node_update', (d) => useRakshaStore.getState().nodeUpdate(d))
    s.on('pipeline_complete', (d) => useRakshaStore.getState().pipelineComplete(d))
    s.on('pipeline_error', (d) => useRakshaStore.getState().pipelineError('Reasoner error: ' + d.error))

    return () => {
      workerRef.current?.terminate()
      socketRef.current?.disconnect()
    }
  }, [handleLocalSignals])

  // ── Phase 4 Task 2: Initialize WebLLM worker (lazy — only when requested) ───
  const initLLMWorker = useCallback(() => {
    if (llmWorkerRef.current) return  // already initialized
    setLlmStatus('loading')
    setLlmProgress(0)

    const worker = new Worker(new URL('./workers/llm.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = (event) => {
      const { type, id, text, loaded, model, result, delta, error: err } = event.data

      if (type === 'progress') {
        setLlmProgressText(text ?? '')
        setLlmProgress(typeof loaded === 'number' ? Math.round(loaded * 100) : 0)
      } else if (type === 'ready') {
        setLlmStatus('ready')
        setLlmProgress(100)
        setLlmModel(model)
      } else if (type === 'chunk') {
        // Streaming token — could show in UI in future
      } else if (type === 'complete') {
        useRakshaStore.getState().pipelineComplete({
          signals: result?.signals,
          alertText: result?.alertText,
          retrievedAdvisories: null,
          elapsedMs: null,
        })
      } else if (type === 'error') {
        if (llmStatus === 'loading') {
          setLlmStatus('error')
        }
        useRakshaStore.getState().pipelineError('Offline LLM error: ' + err)
      }
    }

    llmWorkerRef.current = worker
    worker.postMessage({ type: 'init' })
  }, [llmStatus])

  // ── Phase 4 Task 3: Initialize Voice Clone worker ────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/voiceClone.worker.js', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (event) => {
      const { type, isCloned, signal } = event.data
      if (type === 'ready') {
        setVoiceCloneWorkerStatus('ready')
      } else if (type === 'result' && isCloned && signal) {
        // Inject voice_clone into the current signal set
        const store = useRakshaStore.getState()
        const currentSignals = store.signals
        const alreadyPresent = currentSignals.some((s) => s.id === 'voice_clone')
        if (!alreadyPresent) {
          const updatedSignals = [...currentSignals, signal]
          const { riskScore: rs, action: act } = scoreRisk(updatedSignals, elapsedSecondsRef.current)
          store.applyLocalResult({ signals: updatedSignals, riskScore: rs, action: act })
          sendRef.current({ type: 'RISK', action: act, riskScore: rs })
        }
      }
    }

    voiceCloneWorkerRef.current = worker
    worker.postMessage({ type: 'init' })

    return () => worker.terminate()
  }, [])

  // ── Expose audio feed hook for CallSimulator (Whisper + VoiceClone) ──────────
  // CallSimulator calls this when it has raw audio from Whisper mode
  const handleAudioChunk = useCallback((float32Audio) => {
    if (!callActive) return
    // Send to voice clone worker for analysis
    if (voiceCloneWorkerRef.current && voiceCloneWorkerStatus === 'ready') {
      const copy = new Float32Array(float32Audio)
      voiceCloneWorkerRef.current.postMessage(
        { type: 'analyze', id: uuidv4(), audio: copy },
        [copy.buffer]
      )
    }
  }, [callActive, voiceCloneWorkerStatus])

  const startCall = useCallback(() => {
    sessionIdRef.current = uuidv4()
    elapsedSecondsRef.current = 0
    lastAnalyzedTranscript.current = ''
    setTranscript('')
    setElapsed(0)
    useRakshaStore.getState().resetCall()
    sendRef.current({ type: 'RESET' })
    sendRef.current({ type: 'START' })
    elapsedTimerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1
      setElapsed(elapsedSecondsRef.current)
    }, 1000)
  }, [])

  const stopCall = useCallback(() => {
    clearInterval(elapsedTimerRef.current)
    sendRef.current({ type: 'STOP' })
  }, [])

  useEffect(() => {
    if (callValue === 'ended' || callValue === 'idle') clearInterval(elapsedTimerRef.current)
  }, [callValue])

  // Local interval analysis — entirely in-browser, every 1.5s while call runs
  useEffect(() => {
    if (!callActive || workerStatus !== 'ready') return
    const intervalId = setInterval(() => {
      const currentText = transcriptRef.current
      if (!currentText) return
      if (Math.abs(currentText.length - lastAnalyzedTranscript.current.length) < 10) return
      lastAnalyzedTranscript.current = currentText
      const words = currentText.split(/\s+/).filter(Boolean)
      const transcriptWindow = words.slice(-TRANSCRIPT_WINDOW_WORDS).join(' ')
      workerRef.current.postMessage({ type: 'classify', id: uuidv4(), text: transcriptWindow })
    }, 1500)
    return () => clearInterval(intervalId)
  }, [callActive, workerStatus])

  const handleDismissAlert = useCallback(() => {
    sendRef.current({ type: 'ACK' })
  }, [])

  // Toggle offline mode: initialize LLM worker on first enable
  const handleToggleOfflineMode = useCallback((enabled) => {
    setOfflineMode(enabled)
    if (enabled && !llmWorkerRef.current) {
      initLLMWorker()
    }
  }, [initLLMWorker])

  const overlayResult = { riskScore, action, signals, alertText, retrievedAdvisories: advisories }
  const voiceCloneDetected = signals.some((s) => s.id === 'voice_clone')

  return (
    <div className="min-h-screen text-[#ededed] flex flex-col relative z-0 selection:bg-white/20">
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#050505]/60 backdrop-blur-3xl">
        <div className="max-w-6xl mx-auto px-6 h-24 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <div className="w-12 h-12 rounded-[18px] bg-white flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.1)] relative overflow-hidden group">
              <span className="text-2xl z-10 transition-transform duration-500 group-hover:scale-110">🛡</span>
            </div>
            <div>
              <h1 className="text-[28px] font-bold heading-framer text-white leading-none">
                {UI.title[lang]}
              </h1>
              <p className="text-[11px] font-medium tracking-[0.15em] text-white/40 uppercase mt-2">{UI.tagline[lang]}</p>
            </div>
            <button
              onClick={() => setShowDemoNote(n => !n)}
              className="ml-6 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] bg-white/5 text-white/70 border border-white/10 rounded-full hover:bg-white/10 transition-all uppercase"
            >
              {UI.demoBadge[lang]}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {callActive && (
              <span className="text-[12px] font-bold text-white/80 tracking-widest tabular-nums flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
              </span>
            )}
            {/* Phase 4: Voice Clone detected badge */}
            {voiceCloneDetected && (
              <span className="text-[11px] font-bold text-fuchsia-200 tracking-wide flex items-center gap-2 bg-fuchsia-500/15 px-3 py-1.5 rounded-full border border-fuchsia-500/30 animate-pulse">
                {UI.voiceCloneActive[lang]}
              </span>
            )}
            {workerStatus === 'ready' && modelDevice && (
              <span className="text-[11px] text-emerald-300/80 font-medium tracking-[0.1em] uppercase flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {modelDevice === 'webgpu' ? '⚡ WebGPU' : '🧩 WASM'} · On-device
              </span>
            )}
            {/* Phase 4: Offline mode badge */}
            {offlineMode && llmStatus === 'ready' && (
              <span className="text-[11px] text-violet-300/90 font-medium tracking-[0.1em] uppercase flex items-center gap-2 bg-violet-500/10 px-3 py-1.5 rounded-full border border-violet-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
                🔌 Offline LLM
              </span>
            )}
            {analyzing && (
              <span className="text-[11px] text-[#ededed] font-medium tracking-[0.1em] uppercase flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                {offlineMode ? UI.analyzingOffline[lang] : UI.analyzing[lang]}
              </span>
            )}
            <LanguageToggle lang={lang} onChange={setLang} />
            <button
              onClick={() => setShowSettings(s => !s)}
              className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 hover:scale-105 transition-all text-lg"
            >
              ⚙️
            </button>
          </div>
        </div>
      </header>

      {showDemoNote && (
        <div className="max-w-6xl mx-auto px-6 pt-8 animate-slide-up-fade">
          <div className="bg-white/5 border border-white/10 rounded-[24px] px-8 py-6 backdrop-blur-xl">
            <p className="text-white/70 text-[15px] font-medium leading-relaxed">
              <span className="text-white mr-2">ℹ️</span>{UI.demoNote[lang]}
            </p>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-12 flex-1 w-full space-y-8 relative">
        {/* Decorative background blobs */}
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none animate-blob"></div>
        {/* Phase 4: fuchsia blob when voice clone detected */}
        {voiceCloneDetected && (
          <div className="absolute top-0 right-1/4 w-[300px] h-[300px] bg-fuchsia-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
        )}

        {error && (
          <div className="bg-[#e11d48]/10 border border-[#e11d48]/20 rounded-[24px] px-8 py-5 backdrop-blur-xl animate-slide-up-fade">
            <p className="text-[#ff4d6d] text-[15px] font-medium tracking-wide">⚠ {error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 relative z-10">
          <div className="md:col-span-7">
            <CallSimulator
              lang={lang}
              onTranscriptUpdate={setTranscript}
              onCallStart={startCall}
              onCallStop={stopCall}
              onAudioChunk={handleAudioChunk}
              voiceCloneWorkerReady={voiceCloneWorkerStatus === 'ready'}
            />
          </div>
          <div className="md:col-span-5">
            <RiskMeter
              riskScore={riskScore}
              action={action}
              lang={lang}
            />
          </div>
        </div>

        {/* Phase 4 Task 2: Offline Mode Panel */}
        <OfflineModePanel
          lang={lang}
          offlineMode={offlineMode}
          onToggle={handleToggleOfflineMode}
          llmStatus={llmStatus}
          llmProgress={llmProgress}
          llmProgressText={llmProgressText}
          llmModel={llmModel}
        />

        {(callActive || signals.length > 0) && (
          <SignalPanel signals={signals} lang={lang} />
        )}

        <PipelineViz lang={lang} />

        <LiveTranscript
          transcript={transcript}
          lang={lang}
          isActive={callActive}
          signals={signals}
        />

        {showSettings && (
          <div className="animate-slide-up">
            <SafeWordSetup
              lang={lang}
              safeWord={safeWord}
              onSafeWordChange={setSafeWord}
              mode="setup"
            />
          </div>
        )}

        {advisories?.length > 0 && (
          <div className="card-framer space-y-6 relative z-10 animate-slide-up-fade">
            <p className="text-[12px] font-bold text-white/50 uppercase tracking-[0.2em]">
              {lang === 'en' ? 'Knowledge Base References' : 'संबंधित सलाह'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {advisories.map(adv => (
                <div key={adv.id} className="flex flex-col justify-between bg-black/20 rounded-[20px] p-6 border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all group">
                  <span className="text-[15px] text-white/90 font-medium leading-relaxed group-hover:text-white transition-colors">{adv.title}</span>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-[12px] font-bold text-white/40 uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full">
                      ID: {adv.id.split('-')[0]}
                    </span>
                    <span className="text-[12px] font-bold text-white bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                      {Math.round(adv.relevance * 100)}% Match
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {workerStatus !== 'ready' && (
        <ModelLoadingScreen
          lang={lang}
          progress={modelProgress}
          statusText={workerStatus}
          device={modelDevice}
        />
      )}

      {showAlert && (
        <ScamAlertOverlay
          analysisResult={overlayResult}
          lang={lang}
          safeWord={safeWord}
          onSafeWordChange={setSafeWord}
          onDismiss={handleDismissAlert}
        />
      )}
    </div>
  )
}
