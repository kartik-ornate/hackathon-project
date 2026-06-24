/**
 * PipelineViz.jsx — the live "agentic pipeline" visualization.
 *
 * Driven by the REAL streamed graph events in the store (not a fake animation):
 * each LangGraph node (classify ∥ retrieve → reason → score) lights up as the
 * backend emits its node_update, with live latency and the data it produced.
 * This is the on-screen proof of the agentic claim.
 */
import React from 'react'
import { useRakshaStore } from '../state/useRakshaStore.js'

const NODE_META = {
  classify: { icon: '🧠', label: { en: 'Classify', hi: 'वर्गीकरण' }, sub: { en: 'Tier-1 signals', hi: 'संकेत' } },
  retrieve: { icon: '📚', label: { en: 'Retrieve', hi: 'खोज' }, sub: { en: 'RAG advisories', hi: 'सलाह' } },
  reason: { icon: '🤖', label: { en: 'Reason', hi: 'विश्लेषण' }, sub: { en: 'LLM refine', hi: 'एलएलएम' } },
  score: { icon: '⚖️', label: { en: 'Score', hi: 'स्कोर' }, sub: { en: 'Deterministic', hi: 'नियम' } },

  retrieve_offline: { icon: '💾', label: { en: 'Retrieve', hi: 'खोज' }, sub: { en: 'Local cache', hi: 'लोकल कैश' } },
  reason_offline: { icon: '🔌', label: { en: 'Reason', hi: 'विश्लेषण' }, sub: { en: 'On-device LLM', hi: 'ऑन-डिवाइस LLM' } },
}

const UI = {
  title: { en: 'Agentic Pipeline', hi: 'एजेंटिक पाइपलाइन' },
  live: { en: 'LIVE', hi: 'लाइव' },
  done: { en: 'Complete', hi: 'पूर्ण' },
  parallel: { en: 'classify ∥ retrieve run in parallel, then reason → score', hi: 'classify ∥ retrieve समानांतर, फिर reason → score' },
}

function outputSummary(node, update, lang) {
  if (!update) return null
  if (node === 'classify') return `${(update.signals ?? []).length} ${lang === 'en' ? 'signals' : 'संकेत'}`
  if (node === 'retrieve') return `${(update.advisories ?? []).length} ${lang === 'en' ? 'advisories' : 'सलाह'}`
  if (node === 'reason') return lang === 'en' ? 'refined' : 'परिष्कृत'
  if (node === 'score') return `${lang === 'en' ? 'risk' : 'जोखिम'} ${update.riskScore ?? 0}`
  return null
}

function nodeStateClasses(state) {
  switch (state) {
    case 'done':
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    case 'active':
      return 'border-white/40 bg-white/10 text-white animate-pulse'
    case 'pending':
      return 'border-white/10 bg-white/5 text-white/40'
    default:
      return 'border-white/5 bg-white/5 text-white/25'
  }
}

export default function PipelineViz({ lang = 'en' }) {
  const pipeline = useRakshaStore((s) => s.pipeline)
  const visible = pipeline.running || pipeline.events.length > 0
  if (!visible) return null

  const eventMap = {}
  for (const e of pipeline.events) eventMap[e.node] = e

  return (
    <div className="card-framer space-y-6 relative z-10 animate-slide-up-fade">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-lg">🕸️</span>
          <h2 className="text-[18px] font-bold text-white heading-framer">{UI.title[lang]}</h2>
        </div>
        {pipeline.running ? (
          <span className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 tracking-widest uppercase bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {UI.live[lang]}
          </span>
        ) : (
          pipeline.elapsedMs != null && (
            <span className="text-[10px] font-bold text-white/50 tracking-widest uppercase bg-white/5 px-3 py-1 rounded-full border border-white/10">
              {UI.done[lang]} · {pipeline.elapsedMs}ms
            </span>
          )
        )}
      </div>

      <div className="flex items-stretch gap-2 md:gap-3 overflow-x-auto pb-1">
        {pipeline.nodes.map((node, i) => {
          const meta = NODE_META[node] ?? { icon: '⚙️', label: { en: node, hi: node }, sub: { en: '', hi: '' } }
          const state = pipeline.status[node] ?? 'idle'
          const ev = eventMap[node]
          const summary = outputSummary(node, ev?.update, lang)
          return (
            <React.Fragment key={node}>
              <div className={`flex-1 min-w-[120px] rounded-[20px] border p-4 transition-all duration-500 ${nodeStateClasses(state)}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xl">{meta.icon}</span>
                  {state === 'done' && <span className="text-emerald-400 text-sm">✓</span>}
                  {state === 'active' && <span className="text-white/70 text-[10px]">…</span>}
                </div>
                <p className="mt-3 text-[13px] font-bold tracking-wide">{meta.label[lang]}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] opacity-60 mt-0.5">{meta.sub[lang]}</p>
                <div className="mt-3 h-4">
                  {summary && (
                    <span className="text-[11px] font-semibold opacity-90">{summary}</span>
                  )}
                  {ev && state === 'done' && (
                    <span className="text-[10px] opacity-40 ml-2">+{ev.t}ms</span>
                  )}
                </div>
              </div>
              {i < pipeline.nodes.length - 1 && (
                <div className="flex items-center">
                  <span className={`text-lg transition-colors duration-500 ${state === 'done' ? 'text-emerald-400/70' : 'text-white/20'}`}>→</span>
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>

      <p className="text-[11px] text-white/35 tracking-wide">{UI.parallel[lang]}</p>
    </div>
  )
}
