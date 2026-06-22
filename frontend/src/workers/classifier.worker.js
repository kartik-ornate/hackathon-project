/**
 * classifier.worker.js — Tier-1 browser-local scam-signal classifier.
 *
 * v3 upgrade:
 *  - Transformers.js v3 (@huggingface/transformers) with real WebGPU acceleration
 *    and a graceful WASM fallback (the device actually used is reported to the UI).
 *  - Multilingual sentence embeddings (paraphrase-multilingual-MiniLM-L12-v2) so
 *    Hindi + Hinglish calls are classified correctly — the old English-only
 *    MobileBERT-NLI model could not read Devanagari at all.
 *  - Embedding + exemplar-similarity instead of zero-shot NLI: 1 forward pass per
 *    sentence (not 1 per label), and far fewer false positives.
 */
import { pipeline, env } from '@huggingface/transformers'
import exemplars from '../data/signal_exemplars.json'
import { buildSignalIndex, classifySentences, splitSentences, cosineSim } from '../lib/embeddingClassifier.js'

// Browser: never look for local model files, always fetch from the HF hub (cached).
env.allowLocalModels = false

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
// Per-signal thresholds live in the data file so tuning is a data change.
const THRESHOLDS = exemplars._thresholds ?? {}

let extractor = null
let signalIndex = null
let activeDevice = 'wasm'

/** Embed with a specific pipeline instance. */
async function embedWith(ex, texts) {
  const output = await ex(texts, { pooling: 'mean', normalize: true })
  return output.tolist()
}

/**
 * Degeneracy guard: int8 (q8) weights on WebGPU can collapse this model's
 * embeddings so that *every* sentence looks ~identical (cosine ≈ 1) and every
 * signal false-fires. We verify a clearly-unrelated pair stays far apart; if not,
 * we reject this device/dtype and fall back to the next one.
 */
async function embeddingsAreHealthy(ex) {
  try {
    const v = await embedWith(ex, [
      'please share the OTP code sent to your phone',
      'the weather is lovely in the park this afternoon',
    ])
    const sim = cosineSim(v[0], v[1])
    return sim < 0.9
  } catch {
    return false
  }
}

async function loadExtractor(progress_callback) {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator
  // fp16 on WebGPU (q8 collapses this model); fp32 on WASM for correctness.
  const attempts = hasWebGPU
    ? [{ device: 'webgpu', dtype: 'fp16' }, { device: 'wasm', dtype: 'fp32' }]
    : [{ device: 'wasm', dtype: 'fp32' }]

  let lastErr = null
  for (const opt of attempts) {
    try {
      const ex = await pipeline('feature-extraction', MODEL_NAME, { ...opt, progress_callback })
      if (!(await embeddingsAreHealthy(ex))) {
        lastErr = new Error(`degenerate embeddings on ${opt.device}/${opt.dtype}`)
        continue
      }
      activeDevice = opt.device
      return ex
    } catch (err) {
      lastErr = err
      // try the next device/dtype
    }
  }
  throw lastErr ?? new Error('Failed to load feature-extraction pipeline')
}

/** Embed a batch of strings -> array of mean-pooled, L2-normalized vectors. */
async function embed(texts) {
  return embedWith(extractor, texts)
}

self.addEventListener('message', async (event) => {
  const { id, text, type } = event.data

  if (type === 'init') {
    try {
      extractor = await loadExtractor((x) => self.postMessage({ type: 'progress', data: x }))
      // Build exemplar embeddings once, up front.
      signalIndex = await buildSignalIndex(exemplars, embed)
      self.postMessage({ type: 'ready', device: activeDevice })
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message })
    }
    return
  }

  if (type === 'classify') {
    try {
      if (!signalIndex) throw new Error('Classifier not initialized')
      const sentences = splitSentences(text)
      const signals = await classifySentences(sentences, signalIndex, embed, { thresholds: THRESHOLDS })
      self.postMessage({ type: 'result', id, signals, device: activeDevice })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
})
