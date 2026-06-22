/**
 * graph.js — LangGraph.js Orchestrator (single source of truth)
 *
 * Wires: START → {classify, retrieve} (parallel fan-out) → reason → score → END
 * State carries all data between nodes; each node writes only its own keys.
 *
 * This ONE graph now serves BOTH transports:
 *   - REST  POST /api/analyze      → runRakshaGraph()    (blocking .invoke)
 *   - WS    analyze_stream         → streamRakshaGraph() (node-by-node .stream)
 * The streamed node updates drive the live "agentic pipeline" visualization.
 *
 * `classify` accepts client-computed Tier-1 signals when provided (the live
 * browser path), and only falls back to the server-side classifier when they
 * are absent (e.g. a bare REST call). A MemorySaver checkpointer is attached so
 * every run is replayable / inspectable per session (time-travel debugging).
 */
import { randomUUID } from 'crypto'
import { StateGraph, START, END, MemorySaver } from '@langchain/langgraph'
import { classifySignals } from './classifier.js'
import { retrieveAdvisories } from './retriever.js'
import { reasonAboutCall } from './reasoner.js'
import { scoreRisk } from './riskScorer.js'

export const PIPELINE_NODES = ['classify', 'retrieve', 'reason', 'score']

// Graph state shape — each node reads what it needs and writes only its own keys
const graphState = {
  // Inputs (set by caller)
  sessionId: { value: (a, b) => b ?? a },
  transcriptWindow: { value: (a, b) => b ?? a },
  lang: { value: (a, b) => b ?? a },
  elapsedSeconds: { value: (a, b) => b ?? a },
  clientSignals: { value: (a, b) => b ?? a ?? [] },
  // Node outputs
  signals: { value: (a, b) => b ?? a ?? [] },
  advisories: { value: (a, b) => b ?? a ?? [] },
  alertText: { value: (a, b) => b ?? a ?? {} },
  riskScore: { value: (a, b) => b ?? a ?? 0 },
  action: { value: (a, b) => b ?? a ?? 'monitor' },
}

// Node 1: Signal Classifier — uses client (Tier-1 browser) signals if present,
// otherwise runs the server-side classifier. Runs in parallel with Node 2.
async function classifyNode(state) {
  if (Array.isArray(state.clientSignals) && state.clientSignals.length > 0) {
    return { signals: state.clientSignals }
  }
  const signals = await classifySignals(state.transcriptWindow, state.lang)
  return { signals }
}

// Node 2: Knowledge Retriever — runs in parallel with Node 1. Uses client
// signals (available at fan-out) to sharpen the lexical fallback.
async function retrieveNode(state) {
  const advisories = await retrieveAdvisories(state.transcriptWindow, 3, state.clientSignals)
  return { advisories }
}

// Node 3: LLM Reasoner — receives merged state from both parallel branches
async function reasonNode(state) {
  const { signals, alertText } = await reasonAboutCall({
    transcriptWindow: state.transcriptWindow,
    lang: state.lang,
    signals: state.signals,
    advisories: state.advisories,
  })
  return { signals, alertText }
}

// Node 4: Deterministic Risk Scorer — no LLM, pure rules
async function scoreNode(state) {
  const { riskScore, action } = scoreRisk(state.signals, state.elapsedSeconds)
  return { riskScore, action }
}

// Build the graph
const workflow = new StateGraph({ channels: graphState })
  .addNode('classify', classifyNode)
  .addNode('retrieve', retrieveNode)
  .addNode('reason', reasonNode)
  .addNode('score', scoreNode)
  // Fan-out: START → classify AND retrieve (parallel)
  .addEdge(START, 'classify')
  .addEdge(START, 'retrieve')
  // Fan-in: both → reason
  .addEdge('classify', 'reason')
  .addEdge('retrieve', 'reason')
  // Linear: reason → score → END
  .addEdge('reason', 'score')
  .addEdge('score', END)

export const checkpointer = new MemorySaver()
export const compiledGraph = workflow.compile({ checkpointer })

function buildInitialState(input) {
  return {
    sessionId: input.sessionId ?? randomUUID(),
    transcriptWindow: input.transcriptWindow ?? '',
    lang: input.lang ?? 'en',
    elapsedSeconds: input.elapsedSeconds ?? 0,
    clientSignals: input.signals ?? [],
    signals: [],
    advisories: [],
    alertText: {},
    riskScore: 0,
    action: 'monitor',
  }
}

// Fresh thread per analysis call so the checkpointer never "resumes" a finished
// graph; the sessionId still rides along in state for downstream grouping.
function threadConfig(input) {
  const sessionId = input.sessionId ?? 'anon'
  return { configurable: { thread_id: `${sessionId}:${randomUUID()}` } }
}

/**
 * Blocking run (REST). Returns the final merged state.
 * @param {{ sessionId?:string, transcriptWindow:string, lang:string, elapsedSeconds?:number, signals?:Array }} input
 */
export async function runRakshaGraph(input) {
  return compiledGraph.invoke(buildInitialState(input), threadConfig(input))
}

/**
 * Streaming run (WebSocket). Yields [streamMode, data] tuples:
 *   - ['updates', { <node>: partialState }]  per node completion
 *   - ['values',  fullState]                 the running merged state
 */
export function streamRakshaGraph(input) {
  return compiledGraph.stream(buildInitialState(input), {
    ...threadConfig(input),
    streamMode: ['updates', 'values'],
  })
}

/** Map final graph state → the slim wire shape the frontend consumes. */
export function toResponse(state, lang) {
  const retrievedAdvisories = (state?.advisories ?? []).map((adv) => ({
    id: adv.id,
    title: typeof adv.title === 'string' ? adv.title : (adv.title?.[lang] ?? adv.title?.en ?? adv.id),
    relevance: adv.relevance,
  }))
  return {
    riskScore: state?.riskScore ?? 0,
    action: state?.action ?? 'monitor',
    signals: state?.signals ?? [],
    alertText: state?.alertText ?? {},
    retrievedAdvisories,
  }
}
