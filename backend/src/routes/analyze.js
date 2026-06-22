/**
 * analyze.js — Route handler for POST /api/analyze

 */
import { Router } from 'express'
import { runRakshaGraph } from '../agent/graph.js'

const router = Router()

router.post('/', async (req, res) => {
  const { sessionId, lang, transcriptWindow, elapsedSeconds } = req.body ?? {}

  // Validate required fields
  if (!sessionId || typeof sessionId !== 'string') {
    return res.status(400).json({ error: 'sessionId is required (string)' })
  }
  if (!lang || !['hi', 'en'].includes(lang)) {
    return res.status(400).json({ error: 'lang must be "hi" or "en"' })
  }
  if (!transcriptWindow || typeof transcriptWindow !== 'string') {
    return res.status(400).json({ error: 'transcriptWindow is required (string)' })
  }

  const elapsed = typeof elapsedSeconds === 'number' ? elapsedSeconds : 0

  try {
    const state = await runRakshaGraph({ transcriptWindow, lang, elapsedSeconds: elapsed })

    // Map advisories to the slim shape (drop full summary text to keep payload small)
    const retrievedAdvisories = (state.advisories ?? []).map(adv => ({
      id: adv.id,
      title: typeof adv.title === 'string' ? adv.title : (adv.title?.[lang] ?? adv.title?.en ?? adv.id),
      relevance: adv.relevance,
    }))

    return res.json({
      riskScore: state.riskScore,
      action: state.action,
      signals: state.signals ?? [],
      alertText: state.alertText ?? {},
      retrievedAdvisories,
    })
  } catch (err) {
    console.error('[/api/analyze] Unhandled error:', err)
    return res.status(500).json({ error: 'Internal server error', detail: err.message })
  }
})

export default router
