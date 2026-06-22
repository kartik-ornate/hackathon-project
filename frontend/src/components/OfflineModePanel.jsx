/**
 * OfflineModePanel.jsx — Phase 4 Task 2
 *
 * Toggle panel for enabling fully-offline WebLLM reasoning.
 * Shows download progress, model name, and current status.
 * When enabled, Tier-2 reasoning runs via Gemma-2B-IT in the browser
 * with NO backend / network dependency.
 */
import React from 'react'

const UI = {
  title: { en: 'Offline Mode (WebLLM)', hi: 'ऑफलाइन मोड (WebLLM)' },
  subtitle: {
    en: 'Pull the plug — Tier-2 reasoning runs on-device via Gemma-2B-IT. First load downloads ~1.5 GB (cached after).',
    hi: 'नेटवर्क काटें — Tier-2 रीज़निंग Gemma-2B-IT से ऑन-डिवाइस चलती है। पहली बार ~1.5 GB डाउनलोड (फिर कैश होता है)।',
  },
  enable: { en: 'Enable Offline Mode', hi: 'ऑफलाइन मोड चालू करें' },
  disable: { en: 'Disable (Use Cloud)', hi: 'बंद करें (क्लाउड उपयोग करें)' },
  statusLabels: {
    idle:    { en: 'Not loaded', hi: 'लोड नहीं' },
    loading: { en: 'Downloading model…', hi: 'मॉडल डाउनलोड हो रहा है…' },
    ready:   { en: 'Ready', hi: 'तैयार' },
    error:   { en: 'Failed to load', hi: 'लोड विफल' },
  },
  model: { en: 'Model', hi: 'मॉडल' },
  privacy: {
    en: '🔒 With Offline Mode on, NO data leaves your browser — not even to our backend.',
    hi: '🔒 ऑफलाइन मोड में कोई भी डेटा ब्राउज़र से बाहर नहीं जाता।',
  },
}

function StatusDot({ status }) {
  const colors = {
    idle:    'bg-white/20',
    loading: 'bg-amber-400 animate-pulse',
    ready:   'bg-emerald-400',
    error:   'bg-rose-400',
  }
  return <span className={`w-2 h-2 rounded-full ${colors[status] ?? colors.idle}`} />
}

export default function OfflineModePanel({
  lang = 'en',
  offlineMode = false,
  onToggle,
  llmStatus = 'idle',
  llmProgress = 0,
  llmProgressText = '',
  llmModel = null,
}) {
  return (
    <div className="card-framer space-y-5 relative z-10 border border-violet-500/20 bg-violet-500/5">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔌</span>
          <div>
            <h2 className="text-[16px] font-bold text-white heading-framer">
              {UI.title[lang]}
            </h2>
            <p className="text-[12px] text-white/45 mt-0.5 max-w-md leading-relaxed">
              {UI.subtitle[lang]}
            </p>
          </div>
        </div>

        {/* Toggle button */}
        <button
          id={offlineMode ? 'offline-mode-disable-btn' : 'offline-mode-enable-btn'}
          onClick={() => onToggle?.(!offlineMode)}
          disabled={llmStatus === 'loading'}
          className={`px-5 py-2.5 rounded-full text-[13px] font-bold transition-all duration-300 disabled:opacity-50 ${
            offlineMode
              ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40 hover:bg-violet-500/30'
              : 'bg-white/8 text-white/70 border border-white/10 hover:bg-white/12 hover:text-white'
          }`}
        >
          {offlineMode ? UI.disable[lang] : UI.enable[lang]}
        </button>
      </div>

      {/* Status row — only shown once loading has started */}
      {llmStatus !== 'idle' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <StatusDot status={llmStatus} />
            <span className="text-[13px] font-semibold text-white/80">
              {UI.statusLabels[llmStatus]?.[lang] ?? llmStatus}
            </span>
            {llmModel && llmStatus === 'ready' && (
              <span className="ml-2 text-[11px] text-violet-300/70 bg-violet-500/10 px-2.5 py-0.5 rounded-full border border-violet-500/20 font-mono">
                {llmModel}
              </span>
            )}
          </div>

          {/* Download progress bar */}
          {llmStatus === 'loading' && (
            <div className="space-y-2">
              <div className="h-1.5 bg-black/30 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-violet-500 transition-all duration-500 ease-out relative"
                  style={{ width: `${llmProgress}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-violet-300/40 animate-pulse" />
                </div>
              </div>
              {llmProgressText && (
                <p className="text-[11px] text-white/40 font-mono leading-tight truncate">
                  {llmProgressText}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Privacy note — shown when offline mode is active and ready */}
      {offlineMode && llmStatus === 'ready' && (
        <p className="text-[12px] text-violet-300/70 bg-violet-500/10 rounded-2xl px-4 py-3 border border-violet-500/20">
          {UI.privacy[lang]}
        </p>
      )}
    </div>
  )
}
