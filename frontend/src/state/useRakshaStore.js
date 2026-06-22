/**
 * useRakshaStore.js — single Zustand store for all call/pipeline DATA.
 *
 * The XState callMachine owns the call *status* (idle/active/warn/block/ended);
 * this store owns the *data* (transcript, signals, risk, advisories, alert, and
 * the live agentic-pipeline trace that drives the Phase-3 visualization).
 *
 * Side-effectful resources (Web Worker, Socket.IO) are created in App and call
 * these actions — keeping the store pure and easy to reason about.
 */
import { create } from 'zustand'

export const PIPELINE_NODES = ['classify', 'retrieve', 'reason', 'score']
export const PIPELINE_NODES_OFFLINE = ['retrieve_offline', 'reason_offline', 'score']

const freshPipeline = () => ({
  running: false,
  nodes: PIPELINE_NODES,
  status: Object.fromEntries(PIPELINE_NODES.map((n) => [n, 'idle'])),
  events: [],
  elapsedMs: null,
  isOffline: false,
})

export const useRakshaStore = create((set) => ({
  // ── data ──────────────────────────────────────────────────────────────────
  signals: [],
  riskScore: 0,
  action: 'monitor',
  advisories: [],
  alertText: null,
  analyzing: false,
  error: null,
  modelDevice: null,
  pipeline: freshPipeline(),

  // ── setters ─────────────────────────────────────────────────────────────--
  setModelDevice: (modelDevice) => set({ modelDevice }),
  setError: (error) => set({ error }),

  /** Tier-1 result: local signals + locally-computed deterministic score. */
  applyLocalResult: ({ signals, riskScore, action }) =>
    set({ signals, riskScore, action }),

  // ── streamed Tier-2 pipeline ───────────────────────────────────────────────
  pipelineStart: ({ nodes } = {}) => {
    const list = nodes ?? PIPELINE_NODES
    const isOffline = list.some((n) => n.endsWith('_offline'))
    const status = Object.fromEntries(list.map((n, i) => [n, i === 0 ? 'active' : 'pending']))
    set({
      analyzing: true,
      error: null,
      pipeline: { running: true, nodes: list, status, events: [], elapsedMs: null, isOffline },
    })
  },

  nodeUpdate: ({ node, update, t }) =>
    set((s) => {
      const status = { ...s.pipeline.status, [node]: 'done' }
      // light up the next still-pending node so the viz advances
      const idx = s.pipeline.nodes.indexOf(node)
      for (let i = idx + 1; i < s.pipeline.nodes.length; i++) {
        if (status[s.pipeline.nodes[i]] === 'pending') {
          status[s.pipeline.nodes[i]] = 'active'
          break
        }
      }
      return {
        pipeline: { ...s.pipeline, status, events: [...s.pipeline.events, { node, update, t }] },
      }
    }),

  pipelineComplete: (result) =>
    set((s) => ({
      analyzing: false,
      // Tier-2 may refine Tier-1 signals/score — adopt the backend's final values.
      signals: result.signals ?? s.signals,
      riskScore: typeof result.riskScore === 'number' ? result.riskScore : s.riskScore,
      action: result.action ?? s.action,
      alertText: result.alertText ?? s.alertText,
      advisories: result.retrievedAdvisories ?? s.advisories,
      pipeline: {
        ...s.pipeline,
        running: false,
        status: Object.fromEntries(s.pipeline.nodes.map((n) => [n, 'done'])),
        elapsedMs: result.elapsedMs ?? null,
      },
    })),

  pipelineError: (error) =>
    set((s) => ({ analyzing: false, error, pipeline: { ...s.pipeline, running: false } })),

  /** Reset everything for a new call. */
  resetCall: () =>
    set({
      signals: [],
      riskScore: 0,
      action: 'monitor',
      advisories: [],
      alertText: null,
      analyzing: false,
      error: null,
      pipeline: freshPipeline(),
    }),
}))
