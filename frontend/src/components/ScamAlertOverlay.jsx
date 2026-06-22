/**
 * ScamAlertOverlay.jsx
 * Full-screen scam alert modal, rendered when action is 'warn' or 'block'.
 * Faithfully recreates the pitch deck's UI mockup.
 * On mount, speaks alertText[lang] once via speechSynthesis.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useSpeechSynthesis } from '../hooks/useSpeechSynthesis.js'
import SafeWordSetup from './SafeWordSetup.jsx'

const UI = {
  header: { en: '⚠ SCAM ALERT', hi: '⚠ स्कैम अलर्ट' },
  risk: { en: 'Risk', hi: 'जोखिम' },
  detected: { en: 'Detected Scam Signals', hi: 'पहचाने गए स्कैम संकेत' },
  hangup: { en: '📵 Hang Up & Block', hi: '📵 कॉल काटें और ब्लॉक करें' },
  report: { en: '📋 Report to 1930', hi: '📋 1930 को रिपोर्ट करें' },
  verify: { en: '👨‍👩‍👧 Verify: Call Back Family', hi: '👨‍👩‍👧 सत्यापित करें: परिवार को कॉल करें' },
  dismiss: { en: 'Dismiss Alert', hi: 'अलर्ट बंद करें' },
  demoReport: {
    en: '🛈 DEMO ONLY — In production this would submit your report to the 1930 National Cybercrime Helpline API.',
    hi: '🛈 केवल डेमो — उत्पादन में यह 1930 राष्ट्रीय साइबर अपराध हेल्पलाइन API पर रिपोर्ट भेजेगा।',
  },
  signals: {
    urgency: { en: 'Urgency', hi: 'तात्कालिकता' },
    authority: { en: 'Authority Impersonation', hi: 'प्राधिकरण का दुरुपयोग' },
    secrecy: { en: 'Secrecy / Isolation', hi: 'गोपनीयता' },
    threat: { en: 'Threat', hi: 'धमकी' },
    payment: { en: 'Payment / OTP Extraction', hi: 'भुगतान/ओटीपी मांग' },
  },
}

export default function ScamAlertOverlay({ analysisResult, lang, safeWord, onSafeWordChange, onDismiss }) {
  const { speak } = useSpeechSynthesis()
  const hasSpoken = useRef(false)
  const [showReport, setShowReport] = useState(false)
  const [showVerify, setShowVerify] = useState(false)

  const { riskScore, action, signals = [], alertText = {} } = analysisResult || {}
  const isBlock = action === 'block'

  useEffect(() => {
    // The overlay now appears the instant Tier-1 flags warn/block, so alertText
    // (from the streamed Tier-2 reasoner) may arrive a moment later. Speak once,
    // whenever it becomes available.
    if (!hasSpoken.current && alertText?.[lang]) {
      hasSpoken.current = true
      setTimeout(() => speak(alertText[lang], lang), 400)
    }
  }, [alertText, lang])

  const signalLabel = (sig) => UI.signals[sig.id]?.[lang] ?? sig.label ?? sig.id

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xl animate-slide-up-fade">
      <div className={`w-full max-w-[540px] rounded-[32px] border overflow-hidden relative shadow-[0_32px_64px_rgba(0,0,0,0.5)] ${
        isBlock
          ? 'bg-[#050505] border-[#e11d48]/30 shadow-[#e11d48]/10'
          : 'bg-[#050505] border-amber-500/30 shadow-amber-500/10'
      }`}>
        
        {/* Soft Radial Danger Glow */}
        <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] blur-[100px] pointer-events-none rounded-full ${isBlock ? 'bg-[#e11d48]/20' : 'bg-amber-500/20'}`}></div>

        <div className="px-10 pt-10 pb-6 relative z-10">
          <div className="flex items-center justify-between mb-8">
            <h1 className={`text-3xl heading-framer font-bold tracking-tighter flex items-center gap-4 ${isBlock ? 'text-white' : 'text-white'}`}>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isBlock ? 'bg-[#e11d48]/20 text-[#e11d48]' : 'bg-amber-500/20 text-amber-500'}`}>
                <span className={`text-2xl ${isBlock ? 'animate-pulse' : ''}`}>{isBlock ? '🚨' : '⚠️'}</span>
              </div>
              {UI.header[lang]}
            </h1>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-bold mb-1">{UI.risk[lang]}</span>
              <span className={`text-3xl font-bold tracking-tighter leading-none ${isBlock ? 'text-[#ff4d6d]' : 'text-amber-400'}`}>{riskScore}%</span>
            </div>
          </div>
        </div>

        <div className="px-10 pb-10 space-y-8 max-h-[70vh] overflow-y-auto relative z-10">
          {/* Detected signals */}
          {signals.length > 0 && (
            <div className="space-y-4">
              <p className="text-[11px] font-bold text-white/40 uppercase tracking-[0.2em]">
                {UI.detected[lang]}
              </p>
              <div className="space-y-3">
                {signals.map((sig, i) => (
                  <div key={sig.id ?? i} className="bg-white/5 rounded-[20px] p-5 border border-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${isBlock ? 'bg-[#e11d48]' : 'bg-amber-500'}`}></span>
                        <p className="font-semibold text-white/90 text-sm tracking-wide">{signalLabel(sig)}</p>
                      </div>
                      {sig.confidence != null && (
                        <span className="text-white/40 text-[11px] font-bold">{Math.round(sig.confidence * 100)}%</span>
                      )}
                    </div>
                    {sig.evidencePhrase && (
                      <p className="text-white/50 text-[13px] ml-5 italic leading-relaxed">
                        "{sig.evidencePhrase}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alert text */}
          {alertText?.[lang] && (
            <div className={`rounded-[24px] p-6 border backdrop-blur-md ${
              isBlock ? 'bg-[#e11d48]/10 border-[#e11d48]/20' : 'bg-amber-500/10 border-amber-500/20'
            }`}>
              <p className={`text-[15px] font-medium leading-relaxed tracking-wide ${isBlock ? 'text-[#ff4d6d]' : 'text-amber-200'}`}>
                {alertText[lang]}
              </p>
            </div>
          )}

          {/* Verify flow */}
          {showVerify && (
            <div className="bg-white/5 rounded-[24px] border border-white/10 p-6">
              <SafeWordSetup lang={lang} safeWord={safeWord} onSafeWordChange={onSafeWordChange} mode="verify" />
            </div>
          )}

          {/* Report modal */}
          {showReport && (
            <div className="bg-blue-500/10 rounded-[20px] border border-blue-500/20 p-5 flex items-center gap-4">
              <span className="text-2xl">🌐</span>
              <p className="text-blue-300/90 text-[13px] font-medium leading-relaxed">{UI.demoReport[lang]}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3 pt-6 border-t border-white/5">
            <button
              id="alert-hangup-btn"
              onClick={onDismiss}
              className={`w-full py-4 text-[15px] font-bold rounded-full transition-all duration-300 active:scale-95 ${
                isBlock ? 'bg-[#e11d48] hover:bg-[#be123c] text-white shadow-[0_8px_20px_rgba(225,29,72,0.3)]' : 'bg-amber-500 hover:bg-amber-600 text-black shadow-[0_8px_20px_rgba(245,158,11,0.3)]'
              }`}
            >
              {UI.hangup[lang]}
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                id="alert-report-btn"
                onClick={() => setShowReport(r => !r)}
                className="pill-btn"
              >
                {UI.report[lang]}
              </button>
              <button
                id="alert-verify-btn"
                onClick={() => setShowVerify(v => !v)}
                className="pill-btn"
              >
                {UI.verify[lang]}
              </button>
            </div>

            {!isBlock && (
              <button
                id="alert-dismiss-btn"
                onClick={onDismiss}
                className="w-full text-white/40 hover:text-white text-[12px] font-bold tracking-[0.1em] uppercase py-3 transition-colors mt-2"
              >
                {UI.dismiss[lang]}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
