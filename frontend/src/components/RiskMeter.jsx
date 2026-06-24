/**
 * RiskMeter.jsx
 * Horizontal 0-100 gauge: green (<60) / amber (60-84) / red (>=85).

 * they come from the API response action field.
 */
import React from 'react'

const UI = {
  title: { en: 'Scam Risk Level', hi: 'स्कैम जोखिम स्तर' },
  monitor: { en: 'MONITOR', hi: 'निगरानी' },
  warn: { en: 'WARNING', hi: 'चेतावनी' },
  block: { en: 'DANGER', hi: 'खतरा' },
  noActivity: { en: 'Waiting for call data...', hi: 'कॉल डेटा की प्रतीक्षा...' },
}

function getRiskStyle(score) {
  if (score >= 85) return { bar: 'bg-red-500', glow: 'shadow-red-500/40', text: 'text-red-400', bg: 'from-red-900/30' }
  if (score >= 60) return { bar: 'bg-amber-500', glow: 'shadow-amber-500/40', text: 'text-amber-400', bg: 'from-amber-900/30' }
  return { bar: 'bg-green-500', glow: 'shadow-green-500/40', text: 'text-green-400', bg: 'from-green-900/30' }
}

function getActionLabel(action, lang) {
  return UI[action]?.[lang] ?? UI.monitor[lang]
}

export default function RiskMeter({ riskScore, action, lang }) {
  const score = riskScore ?? 0
  const style = getRiskStyle(score)
  const hasData = riskScore !== null && riskScore !== undefined

  return (
    <div className={`card-framer h-full flex flex-col relative`}>
      {/* Background glow based on risk */}
      <div className={`absolute top-0 right-0 w-64 h-64 blur-[100px] pointer-events-none rounded-full ${
        hasData ? (action === 'block' ? 'bg-rose-500/20' : action === 'warn' ? 'bg-amber-500/20' : 'bg-emerald-500/20') : ''
      }`}></div>

      <div className="flex items-center justify-between mb-8">
        <h2 className="text-[20px] font-bold text-white heading-framer flex items-center gap-3">
           {UI.title[lang]}
        </h2>
        {hasData && (
          <span className={`badge-framer ${
            action === 'block' ? 'badge-rose' :
            action === 'warn' ? 'badge-amber' : 'badge-emerald'
          }`}>
            {getActionLabel(action, lang)}
          </span>
        )}
      </div>

      {hasData ? (
        <div className="flex-1 flex flex-col justify-center space-y-12">
          {/* Score number */}
          <div className="flex items-baseline gap-2 justify-center">
            <span className={`text-[120px] font-bold tracking-tighter leading-none heading-framer ${
              action === 'block' ? 'text-white text-glow' : action === 'warn' ? 'text-white text-glow' : 'text-white'
            }`}>
              {score}
            </span>
            <span className="text-white/40 text-2xl font-bold">/100</span>
          </div>

          <div className="space-y-4">
            {/* Bar */}
            <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
              {/* Fill bar */}
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  action === 'block' ? 'bg-[#e11d48]' : action === 'warn' ? 'bg-amber-500' : 'bg-[#10b981]'
                }`}
                style={{ width: `${score}%` }}
              ></div>
              {/* Threshold markers */}
              <div className="absolute inset-y-0 left-[60%] w-[2px] bg-[#050505]" />
              <div className="absolute inset-y-0 left-[85%] w-[2px] bg-[#050505]" />
            </div>

            {/* Threshold labels */}
            <div className="flex justify-between text-[11px] font-bold text-white/40 uppercase tracking-widest px-1">
              <span>0</span>
              <span className="relative left-[5%]">60</span>
              <span className="relative right-[-5%]">85</span>
              <span>100</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-50">
          <div className="w-16 h-16 rounded-full border border-white/10 flex items-center justify-center bg-white/5 relative">
            <div className="absolute inset-0 rounded-full border border-white/20 animate-ping"></div>
            <span className="text-xl">⚲</span>
          </div>
          <p className="text-white/60 text-[13px] font-bold tracking-[0.2em] uppercase">{UI.noActivity[lang]}</p>
        </div>
      )}
    </div>
  )
}
