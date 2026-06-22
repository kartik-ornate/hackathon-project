/**
 * SignalPanel.jsx — live breakdown of the 5 scam signals during a call.
 * Shows which signals are active, their confidence, and the evidence phrase —
 * the detail judges (and users) most want to see, not buried in the alert.
 */
import React from 'react'
import { SIGNAL_ORDER, SIGNAL_META } from '../data/signalMeta.js'

const UI = {
  title: { en: 'Detected Signals', hi: 'पहचाने गए संकेत' },
  none: { en: 'No scam signals yet', hi: 'अभी कोई संकेत नहीं' },
  weight: { en: 'wt', hi: 'भार' },
  notDetected: { en: 'not detected', hi: 'नहीं मिला' },
}

export default function SignalPanel({ signals = [], lang = 'en' }) {
  const byId = {}
  for (const s of signals) byId[s.id] = s
  const activeCount = SIGNAL_ORDER.filter((id) => byId[id]).length

  return (
    <div className="card-framer space-y-5 relative z-10 animate-slide-up-fade">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-white heading-framer flex items-center gap-3">
          <span className="text-white/60">🎯</span>
          {UI.title[lang]}
        </h2>
        <span className="text-[11px] font-bold text-white/50 tracking-widest uppercase bg-white/5 px-3 py-1 rounded-full border border-white/10">
          {activeCount} / {SIGNAL_ORDER.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SIGNAL_ORDER.map((id) => {
          const meta = SIGNAL_META[id]
          const hit = byId[id]
          const conf = hit?.confidence != null ? Math.round(hit.confidence * 100) : null
          return (
            <div
              key={id}
              className={`rounded-[18px] border p-4 transition-all duration-500 ${
                hit ? meta.chip : 'border-white/5 bg-white/[0.02] opacity-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${hit ? meta.dot : 'bg-white/20'}`} />
                  <span className="text-base">{meta.icon}</span>
                  <span className={`text-[13px] font-bold tracking-wide ${hit ? meta.text : 'text-white/40'}`}>
                    {meta.label[lang]}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                  {UI.weight[lang]} {meta.weight}
                </span>
              </div>

              {hit ? (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-black/30 rounded-full overflow-hidden">
                      <div className={`h-full ${meta.bar} transition-all duration-700`} style={{ width: `${conf}%` }} />
                    </div>
                    <span className="text-[11px] font-bold text-white/70 w-9 text-right">{conf}%</span>
                  </div>
                  {hit.evidencePhrase && (
                    <p className="text-white/55 text-[12px] italic leading-snug line-clamp-2">"{hit.evidencePhrase}"</p>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-[11px] text-white/25 uppercase tracking-widest font-bold">{UI.notDetected[lang]}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
