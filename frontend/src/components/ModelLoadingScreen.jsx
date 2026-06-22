/**
 * ModelLoadingScreen.jsx
 * Full-screen first-load experience while the Tier-1 model downloads + warms up.
 * Replaces the old "tiny status text in the header" with an honest, reassuring
 * progress UI that explains *what* is happening (on-device download, one-time)
 * and *why* it's worth the wait (zero-latency, privacy).
 */
import React from 'react'

const COPY = {
  title: { en: 'Arming your on-device shield', hi: 'आपकी ऑन-डिवाइस सुरक्षा तैयार हो रही है' },
  sub: {
    en: 'Downloading the multilingual scam-detection model — this happens once, then it runs entirely in your browser with no network and no audio ever leaving your device.',
    hi: 'मल्टीलिंगुअल स्कैम-डिटेक्शन मॉडल डाउनलोड हो रहा है — यह केवल एक बार होता है, फिर यह पूरी तरह आपके ब्राउज़र में चलता है।',
  },
  cached: { en: 'Cached for next time', hi: 'अगली बार के लिए सेव' },
  warming: { en: 'Warming up the model…', hi: 'मॉडल तैयार हो रहा है…' },
}

export default function ModelLoadingScreen({ lang = 'en', progress = 0, statusText = '', device = null }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)))
  const isWarming = pct >= 100 || (statusText && /loaded|ready/i.test(statusText))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050505]/95 backdrop-blur-2xl">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[420px] h-[420px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative w-full max-w-md mx-auto px-8 text-center">
        <div className="mx-auto w-16 h-16 rounded-[22px] bg-white flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.15)] mb-8">
          <span className="text-3xl animate-pulse">🛡</span>
        </div>

        <h2 className="text-[22px] font-bold text-white heading-framer leading-tight mb-3">
          {COPY.title[lang]}
        </h2>
        <p className="text-[14px] text-white/55 leading-relaxed mb-8">{COPY.sub[lang]}</p>

        {/* Progress bar */}
        <div className="h-2.5 bg-black/50 rounded-full overflow-hidden border border-white/10 mb-3">
          <div
            className="h-full bg-white relative transition-all duration-500 ease-out"
            style={{ width: `${isWarming && pct < 100 ? 100 : pct}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/40 animate-pulse" />
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] font-medium tracking-wide text-white/45">
          <span className="truncate max-w-[70%] text-left">
            {isWarming ? COPY.warming[lang] : (statusText || `${pct}%`)}
          </span>
          <span className="text-white/70 font-bold">{isWarming ? '100%' : `${pct}%`}</span>
        </div>

        {/* Honest device badge once we know it */}
        {device && (
          <div className="mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold tracking-[0.15em] uppercase text-white/70">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {device === 'webgpu' ? '⚡ WebGPU accelerated' : '🧩 WASM (CPU)'} · on-device
          </div>
        )}
      </div>
    </div>
  )
}
