/**
 * riskScorer.js — Node 4: Deterministic Risk Scorer
 * PURE function — no network calls, no Gemini imports.
 * Thresholds and weights are read from scam_taxonomy.json, NOT hardcoded here,
 * so tuning is a data change, not a code change.
 *

 */
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Try multiple candidate paths so this works both from server.js cwd and from test runner
function findDataFile(filename) {
  const candidates = [
    resolve(__dirname, '../../../../data', filename),       // from src/agent/
    resolve(__dirname, '../../../data', filename),          // fallback
    resolve(process.cwd(), 'data', filename),               // from backend/ cwd
    resolve(process.cwd(), '../data', filename),            // from project root
  ]
  for (const p of candidates) {
    try { readFileSync(p); return p } catch {}
  }
  throw new Error(`[RiskScorer] Cannot find ${filename}. Tried: ${candidates.join(', ')}`)
}

const taxonomy = JSON.parse(readFileSync(findDataFile('scam_taxonomy.json'), 'utf-8'))

const signalWeights = Object.fromEntries(taxonomy.signals.map(s => [s.id, s.weight]))
const { base_threshold_warn, base_threshold_block, escalation_rules } = taxonomy.scoring

/**
 * @param {Array<{id:string}>} signals
 * @param {number} elapsedSeconds
 * @returns {{ riskScore: number, action: 'monitor'|'warn'|'block' }}
 */
export function scoreRisk(signals, elapsedSeconds) {
  const signalIds = new Set((signals ?? []).map(s => s.id))

  // Step 1: sum base weights
  let score = 0
  for (const id of signalIds) {
    score += signalWeights[id] ?? 0
  }

  // Step 2: apply escalation rule bonuses
  for (const rule of escalation_rules) {
    if (matchesRule(rule.id, signalIds, elapsedSeconds)) {
      score += rule.bonus
    }
  }

  // Step 3: clamp
  score = Math.min(100, Math.max(0, Math.round(score)))

  // Step 4: map to action using thresholds from JSON
  let action
  if (score >= base_threshold_block) {
    action = 'block'
  } else if (score >= base_threshold_warn) {
    action = 'warn'
  } else {
    action = 'monitor'
  }

  return { riskScore: score, action }
}

/**
 * Implement each escalation rule's condition as actual code.
 * Adding new rules requires adding a new case here — the condition string
 * in the JSON is documentation; this function is the executable truth.
 */
function matchesRule(ruleId, signalIds, elapsedSeconds) {
  switch (ruleId) {
    case 'authority_plus_payment_60s':
      return signalIds.has('authority') && signalIds.has('payment') && elapsedSeconds <= 60

    case 'secrecy_plus_threat':
      return signalIds.has('secrecy') && signalIds.has('threat')

    case 'all_five_signals':
      return ['urgency', 'authority', 'secrecy', 'threat', 'payment'].every(id => signalIds.has(id))


    case 'voice_clone_plus_payment':
      return signalIds.has('voice_clone') && signalIds.has('payment')

    case 'voice_clone_detected':
      return signalIds.has('voice_clone')

    default:
      console.warn(`[RiskScorer] Unknown escalation rule: ${ruleId}`)
      return false
  }
}
