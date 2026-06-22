/**
 * riskScorer.test.js

 * Run: node --test backend/src/agent/riskScorer.test.js
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreRisk } from './riskScorer.js'

// ── Original 5-signal tests (must still pass) ────────────────────────────────

test('no signals → score 0, action monitor', () => {
  const { riskScore, action } = scoreRisk([], 30)
  assert.equal(riskScore, 0)
  assert.equal(action, 'monitor')
})

test('single urgency signal → below warn threshold, monitor', () => {
  const { riskScore, action } = scoreRisk([{ id: 'urgency' }], 30)
  assert.equal(riskScore, 15)
  assert.equal(action, 'monitor')
})

test('authority + payment within 60s → escalation rule triggers → warn or block', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'authority' }, { id: 'payment' }],
    45 // <= 60s
  )
  // 20 + 60 + 30(escalation) = 110 → clamped to 100 → block
  assert.ok(riskScore >= 60, `expected score >= 60, got ${riskScore}`)
  assert.ok(action === 'warn' || action === 'block', `expected warn or block, got ${action}`)
})

test('secrecy + threat → escalation bonus applied, score 55', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'secrecy' }, { id: 'threat' }],
    120
  )
  // 20 + 20 + 15 = 55 → monitor (< 60)
  assert.equal(riskScore, 55)
  assert.equal(action, 'monitor')
})

test('all five signals → all_five_signals bonus → block', () => {
  const { riskScore, action } = scoreRisk(
    [
      { id: 'urgency' },
      { id: 'authority' },
      { id: 'secrecy' },
      { id: 'threat' },
      { id: 'payment' },
    ],
    90
  )
  // 15+20+20+20+60 = 135, + secrecy_plus_threat=+15, + all_five=+25
  // elapsedSeconds=90 > 60, so authority_plus_payment_60s does NOT fire
  // Total before clamp: 175 → clamped to 100
  assert.equal(riskScore, 100)
  assert.equal(action, 'block')
})

test('authority + payment AFTER 60s → no time-based escalation', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'authority' }, { id: 'payment' }],
    90 // > 60s — time rule does not fire
  )
  // 20 + 60 = 80 → warn
  assert.equal(riskScore, 80)
  assert.equal(action, 'warn')
})



test('voice_clone alone → voice_clone_detected bonus (80 + 20 = 100) → block', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'voice_clone' }],
    10
  )
  // weight=80 + voice_clone_detected bonus=20 = 100 → block
  assert.equal(riskScore, 100)
  assert.equal(action, 'block')
})

test('voice_clone + payment → both escalation rules fire → block', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'voice_clone' }, { id: 'payment' }],
    15
  )
  // 80 + 60 = 140 base, + voice_clone_plus_payment=+40, + voice_clone_detected=+20
  // Total: 200 → clamped to 100 → block
  assert.equal(riskScore, 100)
  assert.equal(action, 'block')
})

test('voice_clone + urgency (no payment) → elevated but not payment-level', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'voice_clone' }, { id: 'urgency' }],
    5
  )
  // 80 + 15 = 95, + voice_clone_detected=+20 → clamped to 100 → block
  assert.equal(riskScore, 100)
  assert.equal(action, 'block')
})

test('unknown signal id → gracefully ignored (score 0)', () => {
  const { riskScore, action } = scoreRisk(
    [{ id: 'unknown_future_signal' }],
    0
  )
  assert.equal(riskScore, 0)
  assert.equal(action, 'monitor')
})
