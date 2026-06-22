/**
 * test_stream.mjs — exercise the unified streaming graph without a browser.
 * Runs with no GEMINI_API_KEY to prove graceful degradation:
 *   classify (client signals) → retrieve (lexical fallback) → reason (fallback) → score.
 *
 *   cd backend && node scripts/test_stream.mjs
 */
import { streamRakshaGraph, toResponse, PIPELINE_NODES } from '../src/agent/graph.js'

const input = {
  sessionId: 'test-1',
  lang: 'en',
  elapsedSeconds: 30,
  transcriptWindow:
    'This is calling from the CBI customs department. A warrant has been issued in your name. Do not tell anyone, this is confidential. Share the OTP immediately or you will be arrested.',
  signals: [
    { id: 'authority', evidencePhrase: 'calling from the CBI', confidence: 0.9 },
    { id: 'threat', evidencePhrase: 'a warrant has been issued', confidence: 0.9 },
    { id: 'secrecy', evidencePhrase: 'do not tell anyone', confidence: 0.9 },
    { id: 'payment', evidencePhrase: 'share the OTP', confidence: 0.9 },
  ],
}

console.log('pipeline nodes:', PIPELINE_NODES.join(' → '))
console.log('—'.repeat(60))

let finalValues = null
for await (const [mode, chunk] of await streamRakshaGraph(input)) {
  if (mode === 'updates') {
    for (const [node, update] of Object.entries(chunk)) {
      const keys = Object.keys(update)
      console.log(`  [node done] ${node.padEnd(9)} → wrote { ${keys.join(', ')} }`)
    }
  } else if (mode === 'values') {
    finalValues = chunk
  }
}

console.log('—'.repeat(60))
console.log('FINAL RESPONSE:')
console.log(JSON.stringify(toResponse(finalValues, 'en'), null, 2))
