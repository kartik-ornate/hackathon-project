/**
 * retriever.js — Node 2: Knowledge Retriever (RAG)
 *
 * Tier-2 is cloud-ENHANCED, not cloud-DEPENDENT. Two retrieval modes:
 *   1. Semantic (preferred): Gemini embeddings + cosine similarity.
 *   2. Lexical fallback: tag/keyword overlap against the transcript + the
 *      Tier-1 signals. Kicks in automatically when no GEMINI_API_KEY is set
 *      or the embedding call fails — so the knowledge base still works offline.
 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { genAI } from '../lib/geminiClient.js'
import { config } from '../config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
function findDataFile(filename) {
  const candidates = [
    resolve(__dirname, '../../../../data', filename),
    resolve(__dirname, '../../../data', filename),
    resolve(process.cwd(), 'data', filename),
    resolve(process.cwd(), '../data', filename),
  ]
  for (const p of candidates) {
    try { readFileSync(p); return p } catch {}
  }
  throw new Error(`[Retriever] Cannot find ${filename}.`)
}

// In-memory vector store for demo
const vectorStore = []
let isInitialized = false
let embeddingsAvailable = false

export function isSemanticSearchAvailable() {
  return embeddingsAvailable
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function getEmbedding(text) {
  if (!genAI) throw new Error('GEMINI_API_KEY is missing')
  const model = genAI.getGenerativeModel({ model: config.EMBEDDING_MODEL })
  const result = await model.embedContent(text)
  return result.embedding.values
}

export async function initRetriever() {
  if (isInitialized) return

  const advisories = JSON.parse(readFileSync(findDataFile('sample_advisories.json'), 'utf-8'))

  // Always load advisories so lexical fallback works regardless of API state.
  for (const adv of advisories) vectorStore.push({ ...adv, embedding: null })
  isInitialized = true

  if (!config.GEMINI_API_KEY) {
    embeddingsAvailable = false
    console.warn(`[Retriever] No GEMINI_API_KEY — knowledge base loaded in LEXICAL fallback mode (${advisories.length} advisories).`)
    return
  }

  // Try to enrich with semantic embeddings; degrade gracefully on failure.
  try {
    console.log(`[Retriever] Embedding ${advisories.length} advisories using ${config.EMBEDDING_MODEL}...`)
    for (const adv of vectorStore) {
      const textToEmbed = `Title: ${adv.title.en}\nSummary: ${adv.summary.en}`
      adv.embedding = await getEmbedding(textToEmbed)
    }
    embeddingsAvailable = true
    console.log('[Retriever] Knowledge base ready (semantic search).')
  } catch (err) {
    embeddingsAvailable = false
    console.warn('[Retriever] Embedding failed — falling back to lexical search:', err.message)
  }
}

/**
 * Lexical scoring: tag overlap with detected signals (weighted) + keyword hits
 * from advisory tags/title appearing in the transcript.
 */
function lexicalScore(adv, queryLower, signalIds) {
  const tags = adv.tags ?? []
  let raw = 0
  for (const tag of tags) {
    if (signalIds.has(tag)) raw += 2 // tag matches a live signal
    for (const token of tag.split('_')) {
      if (token.length > 2 && queryLower.includes(token)) raw += 1
    }
  }
  for (const word of (adv.title?.en ?? '').toLowerCase().split(/\W+/)) {
    if (word.length > 3 && queryLower.includes(word)) raw += 0.5
  }
  // Soft-normalize to a 0..1 relevance for display.
  return Math.min(0.99, raw / 6)
}

/**
 * @param {string} queryText  transcript window
 * @param {number} topK
 * @param {Array<{id:string}>} [signals]  Tier-1 signals (improves lexical fallback)
 */
export async function retrieveAdvisories(queryText, topK = 3, signals = []) {
  if (!isInitialized) {
    try { await initRetriever() } catch { return [] }
  }
  if (!queryText || queryText.trim().length === 0) return []

  // Preferred: semantic search.
  if (embeddingsAvailable) {
    try {
      const queryEmbedding = await getEmbedding(queryText)
      const scored = vectorStore.map((adv) => ({
        ...adv,
        relevance: cosineSimilarity(queryEmbedding, adv.embedding),
      }))
      scored.sort((a, b) => b.relevance - a.relevance)
      return scored.slice(0, topK)
    } catch (err) {
      console.warn('[Retriever] Semantic query failed, using lexical fallback:', err.message)
    }
  }

  // Fallback: lexical tag/keyword search.
  const queryLower = queryText.toLowerCase()
  const signalIds = new Set((signals ?? []).map((s) => s.id))
  const scored = vectorStore
    .map((adv) => ({ ...adv, relevance: lexicalScore(adv, queryLower, signalIds) }))
    .filter((adv) => adv.relevance > 0)
  scored.sort((a, b) => b.relevance - a.relevance)
  return scored.slice(0, topK)
}
