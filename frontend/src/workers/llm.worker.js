/**

 *
 * Uses @mlc-ai/web-llm to run a quantized LLM entirely in the browser
 * via WebGPU. This is the "pull the plug" demo mode — once the model
 * is cached, Tier-2 reasoning works with ZERO network connectivity.
 *
 * Model: gemma-2b-it-q4f32_1-MLC (≈1.5GB download, cached after first load)


 *
 * Message API:
 *   IN  { type: 'init' }
 *   OUT { type: 'progress', loaded, total, text }
 *   OUT { type: 'ready', model }
 *
 *   IN  { type: 'reason', id, signals, transcriptWindow, lang, retrievedAdvisories }
 *   OUT { type: 'chunk', id, delta }        — streaming token
 *   OUT { type: 'complete', id, result }    — { signals, alertText, riskScore, action }
 *   OUT { type: 'error', id, error }
 */
import * as webllm from '@mlc-ai/web-llm'

// Gemma-2B-IT 4-bit quantized — good reasoning, browser-stable at ~1.5GB
// Falls back to smaller model if WebGPU isn't capable enough
const PREFERRED_MODEL = 'gemma-2b-it-q4f32_1-MLC'
const FALLBACK_MODEL  = 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'

let engine = null
let loadedModel = null

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildReasoningPrompt(signals, transcriptWindow, lang, advisories) {
  const signalList = (signals ?? [])
    .map((s) => `- ${s.id} (confidence: ${Math.round((s.confidence ?? 0.8) * 100)}%): "${s.evidencePhrase}"`)
    .join('\n')

  const advList = (advisories ?? [])
    .slice(0, 2)
    .map((a) => `- ${a.title}`)
    .join('\n')

  return `You are Raksha, an AI scam detection assistant for Indian phone calls.

Transcript snippet:
"""
${transcriptWindow?.slice(0, 800) ?? ''}
"""

Tier-1 classifier detected these scam signals:
${signalList || '(none)'}

Relevant advisories from knowledge base:
${advList || '(none)'}

Task: Verify the signals given the full conversational context. A signal should be DISMISSED if it appears in a clearly benign context (e.g., a movie plot, not a real threat).

Respond in VALID JSON only, no markdown, no explanation:
{
  "signals": [{"id": "...", "evidencePhrase": "...", "confidence": 0.0}],
  "alertText": {
    "en": "1-2 sentence alert for the user in English",
    "hi": "उपयोगकर्ता के लिए 1-2 वाक्य हिंदी में"
  }
}`
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (event) => {
  const { type, id, signals, transcriptWindow, lang, retrievedAdvisories, model: requestedModel } = event.data

  if (type === 'init') {
    const modelId = requestedModel ?? PREFERRED_MODEL
    try {
      self.postMessage({ type: 'progress', text: 'Initializing WebLLM engine…', loaded: 0, total: 1 })

      engine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (report) => {
          self.postMessage({
            type: 'progress',
            text: report.text,
            loaded: report.progress ?? 0,
            total: 1,
          })
        },
      })

      loadedModel = modelId
      self.postMessage({ type: 'ready', model: modelId })
    } catch (err) {
      // If preferred model fails (e.g., insufficient VRAM), try fallback
      if (modelId !== FALLBACK_MODEL) {
        try {
          self.postMessage({ type: 'progress', text: `Preferred model failed, trying ${FALLBACK_MODEL}…`, loaded: 0, total: 1 })
          engine = await webllm.CreateMLCEngine(FALLBACK_MODEL, {
            initProgressCallback: (report) => {
              self.postMessage({ type: 'progress', text: report.text, loaded: report.progress ?? 0, total: 1 })
            },
          })
          loadedModel = FALLBACK_MODEL
          self.postMessage({ type: 'ready', model: FALLBACK_MODEL })
        } catch (err2) {
          self.postMessage({ type: 'error', error: err2.message })
        }
      } else {
        self.postMessage({ type: 'error', error: err.message })
      }
    }
    return
  }

  if (type === 'reason') {
    if (!engine) {
      self.postMessage({ type: 'error', id, error: 'LLM engine not initialized' })
      return
    }

    const prompt = buildReasoningPrompt(signals, transcriptWindow, lang, retrievedAdvisories)

    try {
      let fullText = ''

      // Stream tokens back to main thread for live UI feedback
      const stream = await engine.chat.completions.create({
        model: loadedModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,  // Low temp for deterministic JSON
        max_tokens: 400,
        stream: true,
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ''
        if (delta) {
          fullText += delta
          self.postMessage({ type: 'chunk', id, delta })
        }
      }

      // Parse the JSON result
      let result = null
      try {
        // Extract JSON from the response (strip any surrounding text)
        const jsonMatch = fullText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        }
      } catch {
        // If JSON parse fails, build a safe fallback
        result = {
          signals: signals ?? [],
          alertText: {
            en: 'Scam patterns detected in this call. Consider hanging up and calling back on an official number.',
            hi: 'इस कॉल में स्कैम के संकेत मिले हैं। कॉल काटें और आधिकारिक नंबर पर वापस कॉल करें।',
          },
        }
      }

      self.postMessage({ type: 'complete', id, result })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
})
