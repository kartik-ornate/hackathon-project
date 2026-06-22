/**
 * server.js — Raksha Backend Entry Point
 * Express app with CORS, JSON parsing, and the /api/analyze route.
 * Embeds the advisory knowledge base BEFORE accepting requests.
 */
import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { config } from './config.js'
import { initRetriever, retrieveAdvisories } from './agent/retriever.js'
import { reasonAboutCall } from './agent/reasoner.js'
import { streamRakshaGraph, PIPELINE_NODES, toResponse } from './agent/graph.js'
import analyzeRouter from './routes/analyze.js'

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: config.CORS_ORIGINS }
})

// CORS — origins come from config (CORS_ORIGINS env; defaults to localhost dev)
app.use(cors({
  origin: config.CORS_ORIGINS,
  methods: ['GET', 'POST'],
}))

app.use(express.json({ limit: '1mb' }))

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', models: { classifier: config.CLASSIFIER_MODEL, reasoner: config.REASONER_MODEL } })
})

// Main route
app.use('/api/analyze', analyzeRouter)

// WebSocket connection
io.on('connection', (socket) => {
  console.log('[Socket] Client connected:', socket.id)
  
  // ── Unified streaming pipeline (the canonical Tier-2 path) ──────────────────
  // Streams the ONE LangGraph node-by-node so the frontend can visualize the
  // agentic pipeline live and receive the final scored result in one flow.
  socket.on('analyze_stream', async (data) => {
    const { sessionId, transcriptWindow, lang = 'en', signals = [], elapsedSeconds = 0 } = data ?? {}
    const started = Date.now()
    try {
      socket.emit('pipeline_start', { sessionId, nodes: PIPELINE_NODES, t: started })

      let finalValues = null
      for await (const [mode, chunk] of await streamRakshaGraph({ sessionId, transcriptWindow, lang, signals, elapsedSeconds })) {
        if (mode === 'updates') {
          for (const [node, update] of Object.entries(chunk)) {
            socket.emit('node_update', { node, update, t: Date.now() - started })
          }
        } else if (mode === 'values') {
          finalValues = chunk
        }
      }

      socket.emit('pipeline_complete', {
        sessionId,
        ...toResponse(finalValues, lang),
        elapsedMs: Date.now() - started,
      })
    } catch (err) {
      console.error('[Socket] analyze_stream error:', err)
      socket.emit('pipeline_error', { error: err.message })
    }
  })

  // ── Legacy non-streaming path (kept for backward compat; superseded by
  //    analyze_stream). Will be removed once the frontend fully migrates. ──────
  socket.on('analyze_reasoner', async (data) => {
    try {
      const { transcriptWindow, lang, signals } = data
      const advisories = await retrieveAdvisories(transcriptWindow, 1, signals)
      const { alertText, signals: refinedSignals } = await reasonAboutCall({
        transcriptWindow,
        lang,
        signals,
        advisories,
      })
      socket.emit('reasoner_result', {
        alertText,
        refinedSignals,
        advisories: advisories.map(a => ({ id: a.id, title: a.title[lang] ?? a.title.en, relevance: a.relevance }))
      })
    } catch (err) {
      console.error('[Socket] reasoner error:', err)
      socket.emit('reasoner_error', { error: err.message })
    }
  })

  socket.on('disconnect', () => {
    console.log('[Socket] Client disconnected:', socket.id)
  })
})

// Boot sequence: embed knowledge base, then start listening
async function boot() {
  console.log('[Raksha] Starting up...')
  console.log(`[Raksha] Target Models: classifier=${config.CLASSIFIER_MODEL}, reasoner=${config.REASONER_MODEL}, embedding=${config.EMBEDDING_MODEL}`)

  try {
    await initRetriever()
  } catch (err) {
    console.error('\n[WARNING] Knowledge Base embedding failed (Likely missing GEMINI_API_KEY).')
    console.error('Exact Error:', err.message)
    console.error('The backend is running, but Tier-2 Reasoner/RAG will fail until the key is added.')
  }

  httpServer.listen(config.PORT, () => {
    console.log(`[Raksha] Server ready on http://localhost:${config.PORT}`)
    console.log('[Raksha] WebSocket & Knowledge base ready — accepting requests.')
  })
}

boot()
