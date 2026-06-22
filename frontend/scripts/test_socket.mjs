/**
 * test_socket.mjs — end-to-end check of the analyze_stream socket protocol,
 * exactly as the refactored frontend speaks it. Requires the backend running.
 *   (start backend) then: cd frontend && node scripts/test_socket.mjs
 */
import { io } from 'socket.io-client'

const URL = process.env.VITE_WS_URL ?? 'http://localhost:4000'
const socket = io(URL)
const seen = []

const input = {
  sessionId: 's1',
  lang: 'en',
  elapsedSeconds: 30,
  transcriptWindow:
    'This is the CBI customs department. A warrant has been issued. Do not tell anyone. Share the OTP now or you will be arrested.',
  signals: [
    { id: 'authority', evidencePhrase: 'CBI customs', confidence: 0.9 },
    { id: 'threat', evidencePhrase: 'warrant issued', confidence: 0.9 },
    { id: 'secrecy', evidencePhrase: 'do not tell anyone', confidence: 0.9 },
    { id: 'payment', evidencePhrase: 'share the OTP', confidence: 0.9 },
  ],
}

socket.on('connect', () => {
  console.log('connected', socket.id)
  socket.emit('analyze_stream', input)
})
socket.on('pipeline_start', (d) => { console.log('▶ pipeline_start nodes=', d.nodes); seen.push('start') })
socket.on('node_update', (d) => { console.log('  ✓ node_update:', d.node, `(+${d.t}ms)`); seen.push('node:' + d.node) })
socket.on('pipeline_complete', (d) => {
  console.log('■ pipeline_complete:', { action: d.action, riskScore: d.riskScore, elapsedMs: d.elapsedMs })
  console.log('  advisories:', (d.retrievedAdvisories ?? []).map((a) => `${a.id}(${Math.round(a.relevance * 100)}%)`).join(', '))
  const ok = seen.includes('start') &&
    ['classify', 'retrieve', 'reason', 'score'].every((n) => seen.includes('node:' + n)) &&
    d.action === 'block'
  console.log(ok ? '\nPASS — full pipeline streamed + scored block' : '\nFAIL — missing events or wrong action')
  socket.close()
  process.exit(ok ? 0 : 1)
})
socket.on('pipeline_error', (d) => { console.error('pipeline_error', d); process.exit(1) })
socket.on('connect_error', (e) => { console.error('connect_error', e.message); process.exit(1) })
setTimeout(() => { console.error('TIMEOUT. seen=', seen); process.exit(1) }, 20000)
