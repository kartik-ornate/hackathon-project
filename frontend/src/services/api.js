/**
 * api.js
 * Fetch wrapper for POST /api/analyze.
 * Exact request/response shape defined in ARCHITECTURE.md section 4.
 */

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api'

/**
 * @param {{ sessionId: string, lang: 'hi'|'en', transcriptWindow: string, elapsedSeconds: number }} params
 * @returns {Promise<{ riskScore: number, action: string, signals: Array, alertText: {en:string,hi:string}, retrievedAdvisories: Array }>}
 */
export async function analyzeTranscript({ sessionId, lang, transcriptWindow, elapsedSeconds }) {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, lang, transcriptWindow, elapsedSeconds }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`/api/analyze ${response.status}: ${err}`)
  }

  return response.json()
}
