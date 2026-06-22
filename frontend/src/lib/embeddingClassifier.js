/**
 * embeddingClassifier.js — runtime-agnostic Tier-1 scam-signal classifier.
 *
 * No model/runtime imports here on purpose: the caller supplies an async
 * `embed(texts) -> number[][]` function. That lets the SAME logic run:
 *   - in the browser Web Worker (Transformers.js + WebGPU), and
 *   - in a plain Node validation/tuning harness (Transformers.js on CPU).
 *
 * Approach: instead of zero-shot NLI (English-only, 1 forward pass per label),
 * we embed a small set of multilingual exemplar phrases per signal once, then
 * classify each live sentence by its MAX cosine similarity to any exemplar of a
 * signal. One forward pass per sentence; cheap dot products after that.
 */

/** Cosine similarity. Robust even if vectors aren't pre-normalized. */
export function cosineSim(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/**
 * Split a transcript window into focused units. Two-pass:
 *   1. Split on sentence delimiters ([.!?।] + newline).
 *   2. Only sub-split *long* run-on sentences (> maxWords) on clause delimiters
 *      (commas/dashes/colons/semicolons), keeping clauses of >= 2 words.
 *
 * Keeping short sentences whole preserves precision (a 2-word greeting like
 * "Hey Priya" won't be turned into a spurious match), while sub-splitting long
 * scam run-ons preserves recall (a buried "CBI Delhi se bol raha hoon" clause
 * still matches the authority signal).
 */
export function splitSentences(text, maxWords = 8) {
  if (!text) return []
  const sentences = text.split(/[.!?।\n]+/).map((s) => s.trim()).filter(Boolean)
  const out = []
  for (const s of sentences) {
    const words = s.split(/\s+/).filter(Boolean)
    if (words.length > maxWords) {
      const clauses = s
        .split(/[,;:—–]+/)
        .map((c) => c.trim())
        .filter((c) => c.split(/\s+/).filter(Boolean).length >= 2)
      if (clauses.length) out.push(...clauses)
      else out.push(s)
    } else {
      out.push(s)
    }
  }
  return out.filter((s) => s.length > 4)
}

/**
 * Build a per-signal index of exemplar embeddings.
 * @param {Record<string, string[]>} exemplarsBySignal  e.g. { payment: ["share the OTP", ...] }
 * @param {(texts: string[]) => Promise<number[][]>} embed
 * @returns {Promise<Record<string, number[][]>>} signalId -> array of exemplar vectors
 */
export async function buildSignalIndex(exemplarsBySignal, embed) {
  const ids = Object.keys(exemplarsBySignal).filter((k) => !k.startsWith('_'))
  const flat = []
  const owner = []
  for (const id of ids) {
    for (const phrase of exemplarsBySignal[id]) {
      flat.push(phrase)
      owner.push(id)
    }
  }
  const vecs = await embed(flat)
  const index = {}
  for (const id of ids) index[id] = []
  for (let i = 0; i < vecs.length; i++) index[owner[i]].push(vecs[i])
  return index
}

/**
 * Classify a list of sentences against the signal index.
 * @param {string[]} sentences
 * @param {Record<string, number[][]>} index
 * @param {(texts: string[]) => Promise<number[][]>} embed
 * @param {{ threshold?: number, thresholds?: Record<string, number> }} [opts]
 *        threshold = global fallback; thresholds = per-signal overrides.
 * @returns {Promise<Array<{ id: string, evidencePhrase: string, confidence: number }>>}
 */
export async function classifySentences(sentences, index, embed, opts = {}) {
  const defaultThreshold = opts.threshold ?? 0.6
  const perSignal = opts.thresholds ?? {}
  if (!sentences || sentences.length === 0) return []

  const vecs = await embed(sentences)
  const best = new Map() // signalId -> { id, evidencePhrase, confidence }

  for (let s = 0; s < sentences.length; s++) {
    const v = vecs[s]
    for (const id of Object.keys(index)) {
      let maxSim = 0
      for (const ev of index[id]) {
        const sim = cosineSim(v, ev)
        if (sim > maxSim) maxSim = sim
      }
      const threshold = perSignal[id] ?? defaultThreshold
      if (maxSim >= threshold) {
        const conf = Number(maxSim.toFixed(2))
        if (!best.has(id) || best.get(id).confidence < conf) {
          best.set(id, { id, evidencePhrase: sentences[s], confidence: conf })
        }
      }
    }
  }
  return Array.from(best.values())
}
