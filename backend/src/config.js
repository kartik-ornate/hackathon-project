/**
 * config.js
 * Loads environment variables for Raksha's backend (Gemini + transport config).
 */
import 'dotenv/config'

if (!process.env.GEMINI_API_KEY) {
  console.warn('[WARNING] GEMINI_API_KEY is not set — Tier-2 Reasoner/RAG will run in degraded (fallback) mode.')
}

/**
 * Parse a comma-separated origin list into an array.
 * Supports "*" to allow any origin (use only for ephemeral demo deploys).
 */
function parseOrigins(raw, fallback) {
  if (!raw) return fallback
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.includes('*') ? '*' : list
}

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173']

export const config = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  PORT: parseInt(process.env.PORT ?? '4000', 10),
  CLASSIFIER_MODEL: process.env.CLASSIFIER_MODEL ?? 'gemini-2.5-flash',
  REASONER_MODEL: process.env.REASONER_MODEL ?? 'gemini-2.5-pro',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL ?? 'text-embedding-004',
  // CORS allow-list. Set CORS_ORIGINS in .env for production, e.g.
  //   CORS_ORIGINS=https://raksha.example.com,https://www.raksha.example.com
  CORS_ORIGINS: parseOrigins(process.env.CORS_ORIGINS, DEFAULT_ORIGINS),
}
