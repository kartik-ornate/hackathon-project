/**
 * App.jsx — Raksha Web Demo (Phase 4 Zero-Cloud Architecture)
 * Tier-1 Fast Scanner (BERT) runs entirely locally in the browser via Web Workers.
 * Risk scoring is local.
 * Tier-2 Reasoner & RAG runs via WebSockets only when triggered.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { io } from 'socket.io-client'
import LanguageToggle from './components/LanguageToggle.jsx'
import CallSimulator from './components/CallSimulator.jsx'
import LiveTranscript from './components/LiveTranscript.jsx'
import RiskMeter from './components/RiskMeter.jsx'
import ScamAlertOverlay from './components/ScamAlertOverlay.jsx'
import SafeWordSetup from './components/SafeWordSetup.jsx'
import ModelLoadingScreen from './components/ModelLoadingScreen.jsx'
import { scoreRisk } from './services/riskScorer.js'

const TRANSCRIPT_WINDOW_WORDS = 100

const UI = {
  title: { en: 'Raksha', hi: 'राक्षा' },
  tagline: { en: 'Real-Time Scam Shield', hi: 'रियल-टाइम स्कैम शील्ड' },
  demoBadge: { en: 'ZERO CLOUD', hi: 'ज़ीरो क्लाउड' },
  demoNote: {
    en: 'What\'s happening here: a multilingual sentence-embedding model runs entirely inside your browser (WebGPU-accelerated, with a WASM fallback). Hindi, English and Hinglish transcripts are analyzed instantly with zero network latency. The backend is only pinged via WebSocket for RAG/Reasoning when a threat is confirmed.',
    hi: 'यहाँ क्या हो रहा है: एक मल्टीलिंगुअल मॉडल पूरी तरह आपके ब्राउज़र के अंदर (WebGPU/WASM) चलता है। हिंदी, अंग्रेज़ी और हिंग्लिश ट्रांसक्रिप्ट तुरंत, बिना नेटवर्क के विश्लेषित होते हैं।',
  },
  settings: { en: 'Settings', hi: 'सेटिंग्स' },
  analyzing: { en: 'Cloud Reasoner Active...', hi: 'क्लाउड रीज़नर सक्रिय...' },
}

export default function App() {
  const [lang, setLang] = useState('en')
  const [transcript, setTranscript] = useState('')
  const [callActive, setCallActive] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [safeWord, setSafeWord] = useState('')
  const [showAlert, setShowAlert] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDemoNote, setShowDemoNote] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [workerStatus, setWorkerStatus] = useState('Initializing local model...')
  const [modelProgress, setModelProgress] = useState(0)
  const [modelDevice, setModelDevice] = useState(null)

  const workerRef = useRef(null)
  const socketRef = useRef(null)
  const sessionIdRef = useRef(null)
  const elapsedSecondsRef = useRef(0)
  const elapsedTimerRef = useRef(null)
  const analyzeTimerRef = useRef(null)
  const lastAnalyzedTranscript = useRef('')
  const transcriptRef = useRef('')

  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // Initialize Web Worker and WebSocket
  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/classifier.worker.js', import.meta.url), { type: 'module' })
    
    workerRef.current.onmessage = (event) => {
      const { type, data, signals, error, device } = event.data
      if (type === 'ready') {
        setWorkerStatus('ready')
        setModelProgress(100)
        if (device) setModelDevice(device)
      } else if (type === 'progress') {
        if (data.status === 'initiate') {
          setWorkerStatus(`Initiating download: ${data.file}`)
        } else if (data.status === 'download') {
          setWorkerStatus(`Downloading ${data.file}...`)
        } else if (data.status === 'progress') {
          setWorkerStatus(`Downloading ${data.file}`)
          if (typeof data.progress === 'number') setModelProgress(data.progress)
        } else if (data.status === 'done') {
          setWorkerStatus(`Loaded ${data.file}`)
        }
      } else if (type === 'result') {
        handleLocalSignals(signals)
      } else if (type === 'error') {
        setApiError('Local classifier error: ' + error)
      }
    }

    workerRef.current.postMessage({ type: 'init' })

    socketRef.current = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:4000')
    socketRef.current.on('reasoner_result', (data) => {
      setAnalysisResult(prev => ({
        ...prev,
        alertText: data.alertText,
        signals: data.refinedSignals ?? prev?.signals,
        retrievedAdvisories: data.advisories
      }))
      setShowAlert(true)
      setIsAnalyzing(false)
    })
    socketRef.current.on('reasoner_error', (data) => {
      setApiError('Reasoner error: ' + data.error)
      setIsAnalyzing(false)
    })

    return () => {
      workerRef.current?.terminate()
      socketRef.current?.disconnect()
    }
  }, [])

  const handleLocalSignals = useCallback((newSignals) => {
    const elapsed = elapsedSecondsRef.current
    const { riskScore, action } = scoreRisk(newSignals, elapsed)
    
    setAnalysisResult(prev => ({
      ...prev,
      riskScore,
      action,
      signals: newSignals,
    }))

    // Tier 2: Trigger Reasoner via WebSockets only if it's a warn/block scenario
    if (action === 'warn' || action === 'block') {
      setIsAnalyzing(true)
      socketRef.current.emit('analyze_reasoner', {
        transcriptWindow: lastAnalyzedTranscript.current,
        lang,
        signals: newSignals
      })
    }
  }, [lang])

  const startCall = useCallback(() => {
    sessionIdRef.current = uuidv4()
    elapsedSecondsRef.current = 0
    setTranscript('')
    setAnalysisResult(null)
    setShowAlert(false)
    setApiError(null)
    lastAnalyzedTranscript.current = ''
    setCallActive(true)

    elapsedTimerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1
    }, 1000)
  }, [])

  const stopCall = useCallback(() => {
    clearInterval(elapsedTimerRef.current)
    clearTimeout(analyzeTimerRef.current)
    setCallActive(false)
  }, [])

  // Local interval analysis — runs rapidly entirely in browser without debounce starvation
  useEffect(() => {
    if (!callActive || workerStatus !== 'ready') return
    
    const intervalId = setInterval(() => {
      const currentText = transcriptRef.current
      if (!currentText) return
      if (Math.abs(currentText.length - lastAnalyzedTranscript.current.length) < 10) return
      lastAnalyzedTranscript.current = currentText

      const words = currentText.split(/\s+/).filter(Boolean)
      const transcriptWindow = words.slice(-TRANSCRIPT_WINDOW_WORDS).join(' ')

      workerRef.current.postMessage({
        type: 'classify',
        id: uuidv4(),
        text: transcriptWindow
      })
    }, 1500)

    return () => clearInterval(intervalId)
  }, [callActive, workerStatus])

  const handleDismissAlert = useCallback(() => {
    setShowAlert(false)
    stopCall()
  }, [stopCall])

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
            {workerStatus === 'ready' && modelDevice && (
              <span className="text-[11px] text-emerald-300/80 font-medium tracking-[0.1em] uppercase flex items-center gap-2 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                {modelDevice === 'webgpu' ? '⚡ WebGPU' : '🧩 WASM'} · On-device
              </span>
            )}
            {isAnalyzing && (
              <span className="text-[11px] text-[#ededed] font-medium tracking-[0.1em] uppercase flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 backdrop-blur-md">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
                {UI.analyzing[lang]}
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
        
        {apiError && (
          <div className="bg-[#e11d48]/10 border border-[#e11d48]/20 rounded-[24px] px-8 py-5 backdrop-blur-xl animate-slide-up-fade">
            <p className="text-[#ff4d6d] text-[15px] font-medium tracking-wide">⚠ {apiError}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 relative z-10">
          <div className="md:col-span-7">
            <CallSimulator
              lang={lang}
              onTranscriptUpdate={setTranscript}
              onCallStart={startCall}
              onCallStop={stopCall}
            />
          </div>
          <div className="md:col-span-5">
            <RiskMeter
              riskScore={analysisResult?.riskScore}
              action={analysisResult?.action}
              lang={lang}
            />
          </div>
        </div>

        <LiveTranscript
          transcript={transcript}
          lang={lang}
          isActive={callActive}
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

        {analysisResult?.retrievedAdvisories?.length > 0 && (
          <div className="card-framer space-y-6 relative z-10 animate-slide-up-fade">
            <p className="text-[12px] font-bold text-white/50 uppercase tracking-[0.2em]">
              {lang === 'en' ? 'Knowledge Base References' : 'संबंधित सलाह'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysisResult.retrievedAdvisories.map(adv => (
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

      {showAlert && analysisResult && (
        <ScamAlertOverlay
          analysisResult={analysisResult}
          lang={lang}
          safeWord={safeWord}
          onSafeWordChange={setSafeWord}
          onDismiss={handleDismissAlert}
        />
      )}
    </div>
  )
}
