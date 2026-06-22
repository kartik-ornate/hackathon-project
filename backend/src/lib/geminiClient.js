/**
 * geminiClient.js
 * Single shared @google/generative-ai client instance.
 * All agent/* modules import from here — no other file instantiates its own client.
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { config } from '../config.js'

export const genAI = config.GEMINI_API_KEY ? new GoogleGenerativeAI(config.GEMINI_API_KEY) : null

/**
 * Get a generative model instance.
 * @param {string} modelName
 * @param {object} [generationConfig]
 */
export function getModel(modelName, generationConfig = {}) {
  if (!genAI) throw new Error('GEMINI_API_KEY is missing')
  return genAI.getGenerativeModel({ model: modelName, generationConfig })
}
