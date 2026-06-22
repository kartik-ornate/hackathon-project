import taxonomy from '../data/scam_taxonomy.json'

const signalWeights = Object.fromEntries(taxonomy.signals.map(s => [s.id, s.weight]))
const { base_threshold_warn, base_threshold_block, escalation_rules } = taxonomy.scoring

export function scoreRisk(signals, elapsedSeconds) {
  const signalIds = new Set((signals ?? []).map(s => s.id))

  let score = 0
  for (const id of signalIds) {
    score += signalWeights[id] ?? 0
  }

  for (const rule of escalation_rules) {
    if (matchesRule(rule.id, signalIds, elapsedSeconds)) {
      score += rule.bonus
    }
  }

  score = Math.min(100, Math.max(0, Math.round(score)))

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

function matchesRule(ruleId, signalIds, elapsedSeconds) {
  switch (ruleId) {
    case 'authority_plus_payment_60s':
      return signalIds.has('authority') && signalIds.has('payment') && elapsedSeconds <= 60
    case 'secrecy_plus_threat':
      return signalIds.has('secrecy') && signalIds.has('threat')
    case 'all_five_signals':
      return ['urgency', 'authority', 'secrecy', 'threat', 'payment'].every(id => signalIds.has(id))
    // Phase 4 — voice clone escalation rules
    case 'voice_clone_plus_payment':
      return signalIds.has('voice_clone') && signalIds.has('payment')
    case 'voice_clone_detected':
      return signalIds.has('voice_clone')
    default:
      console.warn(`[RiskScorer] Unknown escalation rule: ${ruleId}`)
      return false
  }
}
