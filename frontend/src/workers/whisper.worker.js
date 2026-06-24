/**

 *
 * Uses @huggingface/transformers v3 (already installed) to run
 * Xenova/whisper-tiny multilingual entirely in-browser.
 *
 * Accepts Float32Array audio chunks at 16kHz and returns transcribed text.
 * Supports Hindi, English, and Hinglish (code-switched) out of the box.
 *

 * Web Speech API is the cloud/browser-vendor version; this worker uses
 * the actual Whisper model weights entirely locally (no audio ever leaves the device).
 */
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

// Whisper tiny multilingual — ~150MB, supports 99 languages including Hindi/Hinglish
const MODEL_NAME = 'Xenova/whisper-tiny'

let asr = null
let activeDevice = 'wasm'

async function loadASR(progress_callback) {
  const hasWebGPU = typeof navigator !== 'undefined' && 'gpu' in navigator

  // Try WebGPU first for speed, fall back to WASM
  const attempts = hasWebGPU
    ? [
        { device: 'webgpu', dtype: { encoder: 'fp16', decoder: 'fp16' } },
        { device: 'wasm', dtype: 'q8' },
      ]
    : [{ device: 'wasm', dtype: 'q8' }]

  let lastErr = null
  for (const opt of attempts) {
    try {
      const model = await pipeline('automatic-speech-recognition', MODEL_NAME, {
        ...opt,
        progress_callback,
      })
      activeDevice = opt.device
      return model
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr ?? new Error('Failed to load Whisper ASR pipeline')
}

self.addEventListener('message', async (event) => {
  const { type, id, audio, lang } = event.data

  if (type === 'init') {
    try {
      asr = await loadASR((x) => self.postMessage({ type: 'progress', data: x }))
      self.postMessage({ type: 'ready', device: activeDevice })
    } catch (err) {
      self.postMessage({ type: 'error', error: err.message })
    }
    return
  }

  if (type === 'transcribe') {
    try {
      if (!asr) throw new Error('ASR model not initialized')

      // audio is a Float32Array at 16kHz
      // Detect language: using the provided UI lang is more robust for short chunks.
      const language = lang === 'hi' ? 'hindi' : 'english'

      const result = await asr(audio, {
        language,
        task: 'transcribe',
        chunk_length_s: 30,
        return_timestamps: false,
      })

      self.postMessage({
        type: 'transcript',
        id,
        text: result.text?.trim() ?? '',
        device: activeDevice,
      })
    } catch (err) {
      self.postMessage({ type: 'error', id, error: err.message })
    }
  }
})
