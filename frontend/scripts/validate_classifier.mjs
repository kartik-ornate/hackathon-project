/**
 * validate_classifier.mjs — offline validation + threshold tuning for Tier-1.
 *
 * Runs the SAME embedding classifier the browser worker uses, but in Node (CPU),
 * against the three canned demo transcripts. Prints detected signals per script
 * and a per-signal max-similarity table so we can pick a sane threshold and
 * confirm the benign call does NOT false-positive.
 *
 *   cd frontend && npm run validate:classifier
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { pipeline, env } from '@huggingface/transformers'
import { buildSignalIndex, classifySentences, splitSentences, cosineSim } from '../src/lib/embeddingClassifier.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
env.allowLocalModels = false

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'

const exemplars = JSON.parse(
  readFileSync(resolve(__dirname, '../src/data/signal_exemplars.json'), 'utf-8'),
)
const THRESHOLDS = exemplars._thresholds ?? {}

// The three demo transcripts — FULL texts, verbatim from CallSimulator.jsx DEMO_SCRIPTS.
const SCRIPTS = {
  'Digital Arrest (Hindi)': `हेलो, नमस्ते। मैं इंस्पेक्टर राजेश कुमार, सीबीआई दिल्ली से बोल रहा हूं। आपके नाम एक बहुत गंभीर मामला दर्ज हुआ है। आपके आधार कार्ड से एक पार्सल भेजा गया था जिसमें ड्रग्स और जाली पासपोर्ट मिले हैं। यह एक गंभीर अपराध है और आपके खिलाफ वारंट जारी हो चुका है। आपको अभी गिरफ्तार किया जा सकता है। लेकिन अगर आप सहयोग करते हैं तो हम इसे सुलझा सकते हैं। यह बात किसी को मत बताना, यह गोपनीय जांच है। लाइन पर बने रहें और किसी को कॉल मत करें। आपको अभी एक सत्यापन शुल्क के रूप में पचास हजार रुपए सरकारी खाते में जमा करने होंगे। ओटीपी बताएं जो आपके फोन पर आया है। अगर अभी पैसे नहीं भेजे तो दस मिनट में पुलिस आपके घर आ जाएगी। यह आपका आखिरी मौका है, इस खाते में पैसे भेजें नहीं तो गिरफ्तारी होगी। आपको गिरफ्तार किया जाएगा और जेल भेजा जाएगा।`,
  'Bank KYC / OTP (English)': `Hello, am I speaking with the account holder? This is calling from the National Bank Fraud Prevention Department. We have detected suspicious transactions on your account and it will be frozen within the next 10 minutes unless you verify your KYC right now. This is extremely urgent. You must act now to protect your funds. Do not hang up or your account will be immediately suspended. Please do not share this information with anyone else — this is a confidential investigation. Now, to re-verify your KYC, I need you to confirm your debit card number and the OTP that will be sent to your registered mobile number. Please share the OTP immediately — you have less than 5 minutes before your account is permanently deactivated. A warrant has been issued against suspicious activity linked to your account. Transfer your funds to this secure verification account right now, otherwise legal action will be taken against you.`,
  'Benign (English) — must stay clean': `Hey Priya, how are you doing? I was just calling to catch up. Oh, by the way, did you see that movie last night? The one where the detective issues a warrant to arrest the smuggler? Such an urgent plot, I couldn't stop watching. Anyway, I also wanted to ask — did you sort out that bank thing? I remember you mentioned updating your account details. No worries if it's not done yet, just checking in. The whole story about the courier getting intercepted by customs in that thriller was so gripping. Totally felt like they were going to freeze all his accounts. Ha! Anyway, hope you're doing well. Let's plan to meet this weekend if you're free. I'll text you the details. Talk soon!`,
}

const SIGNAL_IDS = Object.keys(exemplars).filter((k) => !k.startsWith('_'))

async function main() {
  console.log(`Loading ${MODEL_NAME} (CPU)…\n`)
  const extractor = await pipeline('feature-extraction', MODEL_NAME)
  const embed = async (texts) => (await extractor(texts, { pooling: 'mean', normalize: true })).tolist()

  const index = await buildSignalIndex(exemplars, embed)

  for (const [name, text] of Object.entries(SCRIPTS)) {
    console.log('═'.repeat(72))
    console.log(name)
    console.log('═'.repeat(72))

    const signals = await classifySentences(splitSentences(text), index, embed, { thresholds: THRESHOLDS })
    if (signals.length === 0) {
      console.log('  detected: (none)')
    } else {
      for (const s of signals.sort((a, b) => b.confidence - a.confidence)) {
        console.log(`  ✓ ${s.id.padEnd(10)} ${s.confidence}  ← "${s.evidencePhrase.slice(0, 64)}"`)
      }
    }

    // Per-signal MAX similarity across the whole transcript (helps tune threshold).
    const sentences = splitSentences(text)
    const vecs = await embed(sentences)
    const maxBySignal = Object.fromEntries(SIGNAL_IDS.map((id) => [id, 0]))
    for (const v of vecs) {
      for (const id of SIGNAL_IDS) {
        for (const ev of index[id]) {
          const sim = cosineSim(v, ev)
          if (sim > maxBySignal[id]) maxBySignal[id] = sim
        }
      }
    }
    console.log(
      '  max-sim:  ' +
        SIGNAL_IDS.map((id) => `${id}=${maxBySignal[id].toFixed(2)}`).join('  '),
    )
    console.log('')
  }

  console.log('per-signal thresholds:', JSON.stringify(THRESHOLDS))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
