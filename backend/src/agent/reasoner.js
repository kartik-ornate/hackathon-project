/**
 * reasoner.js — Node 3: LLM Reasoner
 * Sanity-checks classifier signals using full conversational context.
 */
import { genAI } from '../lib/geminiClient.js'
import { config } from '../config.js'
import { SchemaType } from '@google/generative-ai'

// Fallback bilingual alertText if Ollama call fails
const FALLBACK_ALERT = {
  en: 'This call shows signs of a scam. Do not share any OTP, UPI PIN, or money. Hang up and call 1930 to report.',
  hi: 'इस कॉल में स्कैम के संकेत मिले हैं। कोई भी OTP, UPI पिन या पैसा न दें। कॉल काटें और 1930 पर रिपोर्ट करें।',
}

const RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    signals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          evidencePhrase: { type: SchemaType.STRING },
          confidence: { type: SchemaType.NUMBER },
        },
        required: ['id', 'evidencePhrase', 'confidence'],
      },
    },
    alertText: {
      type: SchemaType.OBJECT,
      properties: {
        en: { type: SchemaType.STRING },
        hi: { type: SchemaType.STRING },
      },
      required: ['en', 'hi'],
    },
  },
  required: ['signals', 'alertText'],
}

export async function reasonAboutCall({ transcriptWindow, lang, signals, advisories }) {
  const topAdvisory = advisories?.[0]
  const advisoryContext = topAdvisory
    ? `Most relevant advisory: "${topAdvisory.title?.en ?? topAdvisory.id}" — ${topAdvisory.summary?.en ?? ''}`
    : 'No advisory matched.'

  const systemPrompt = `You are the reasoning engine for Raksha, an AI scam-detection system.

YOUR TASKS:
1. REFINE the signals array:
   - Remove any signal where the full transcript context makes it clearly benign (e.g. "warrant" or "police" mentioned in a movie-plot retelling).
   - Do NOT add new signal types — only the 5 ids from the taxonomy are valid: urgency, authority, secrecy, threat, payment.
   - Keep, adjust confidence, or remove each signal. Return the refined array.

2. DRAFT alertText as a bilingual object { en, hi }:
   - Language: direct, plain, panic-proof.
   - Must reference: how many scam signs were found, one concrete protective action, and "call 1930 to report".
   - Ground the message in the advisory context.
   - alertText.hi must be natural, fluent Hindi.
   - Keep each language variant under 60 words.

Return ONLY valid JSON matching the schema.`

  const userPrompt = `TRANSCRIPT:
"${transcriptWindow}"

SIGNALS ALREADY DETECTED:
${JSON.stringify(signals, null, 2)}

${advisoryContext}`

  try {
    if (!genAI) throw new Error('GEMINI_API_KEY is missing')
    const model = genAI.getGenerativeModel({
      model: config.REASONER_MODEL,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    })
    
    const response = await model.generateContent(userPrompt)
    const parsed = JSON.parse(response.response.text())
    return {
      signals: parsed.signals ?? signals,
      alertText: parsed.alertText ?? FALLBACK_ALERT,
    }
  } catch (err) {
    console.error('[Reasoner] Gemini call failed, using fallback:', err.message)
    return { signals, alertText: FALLBACK_ALERT }
  }
}
