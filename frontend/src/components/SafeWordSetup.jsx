/**
 * SafeWordSetup.jsx
 * Two-screen family safe-word flow.
 * IMPORTANT: passphrase is stored in React state only — NOT sent to backend,
 * NOT persisted to localStorage or any DB. This mirrors the on-device,

 */
import React, { useState } from 'react'

const UI = {
  setupTitle: { en: 'Family Safe-Word', hi: 'परिवार सुरक्षा-शब्द' },
  setupDesc: {
    en: 'Set a secret word that only your real family members know. During a suspicious call, ask the caller to say it — a scammer won\'t know it.',
    hi: 'एक गुप्त शब्द सेट करें जो केवल आपके असली परिवार के सदस्य जानते हैं। संदिग्ध कॉल के दौरान, कॉलर से यह बताने को कहें — स्कैमर नहीं जानेगा।',
  },
  placeholder: { en: 'Enter your safe-word...', hi: 'सुरक्षा-शब्द दर्ज करें...' },
  save: { en: 'Save Safe-Word', hi: 'सुरक्षा-शब्द सहेजें' },
  change: { en: 'Change Safe-Word', hi: 'सुरक्षा-शब्द बदलें' },
  set: { en: 'Safe-word is set ✓', hi: 'सुरक्षा-शब्द सेट है ✓' },
  verifyTitle: { en: 'Verify Caller Identity', hi: 'कॉलर की पहचान सत्यापित करें' },
  verifyDesc: {
    en: 'Ask the caller to say your family safe-word. Enter what they said:',
    hi: 'कॉलर से परिवार का सुरक्षा-शब्द बोलने को कहें। उन्होंने जो कहा वह दर्ज करें:',
  },
  checkBtn: { en: 'Verify', hi: 'सत्यापित करें' },
  success: { en: '✅ Verified — this matches your family safe-word.', hi: '✅ सत्यापित — यह आपके परिवार के सुरक-शब्द से मेल खाता है।' },
  fail: { en: '❌ This does not match. This may not be who they claim to be — verify another way before sending any money.', hi: '❌ यह मेल नहीं खाता। यह वह नहीं हो सकते जो वे दावा करते हैं — कोई भी पैसा भेजने से पहले दूसरे तरीके से सत्यापित करें।' },
  notSet: { en: 'No safe-word set yet. Please set one first from Settings.', hi: 'अभी तक कोई सुरक-शब्द सेट नहीं है। पहले सेटिंग से एक सेट करें।' },
  privacy: { en: 'Stored only in this browser session — never sent to any server.', hi: 'केवल इस ब्राउज़र सत्र में संग्रहीत — किसी सर्वर को नहीं भेजा गया।' },
}

export default function SafeWordSetup({ lang, safeWord, onSafeWordChange, mode = 'setup' }) {
  const [input, setInput] = useState('')
  const [verifyInput, setVerifyInput] = useState('')
  const [verifyResult, setVerifyResult] = useState(null) // null | 'match' | 'fail'
  const [editing, setEditing] = useState(!safeWord)

  const handleSave = (e) => {
    e.preventDefault()
    if (input.trim()) {
      onSafeWordChange(input.trim())
      setInput('')
      setEditing(false)
    }
  }

  const handleVerify = (e) => {
    e.preventDefault()
    if (!safeWord) { setVerifyResult('noword'); return }
    setVerifyResult(verifyInput.trim().toLowerCase() === safeWord.toLowerCase() ? 'match' : 'fail')
  }

  if (mode === 'verify') {
    return (
      <div className="space-y-4">
        <div>
          <h3 className="font-bold text-white text-lg">{UI.verifyTitle[lang]}</h3>
          <p className="text-gray-400 text-sm mt-1">{UI.verifyDesc[lang]}</p>
        </div>

        {!safeWord ? (
          <p className="text-amber-400 text-sm bg-amber-900/20 rounded-xl px-4 py-3 border border-amber-500/20">
            {UI.notSet[lang]}
          </p>
        ) : (
          <form onSubmit={handleVerify} className="space-y-3">
            <input
              id="safe-word-verify-input"
              type="text"
              value={verifyInput}
              onChange={e => { setVerifyInput(e.target.value); setVerifyResult(null) }}
              placeholder={UI.placeholder[lang]}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white text-lg focus:border-raksha-accent focus:outline-none transition-colors"
              autoFocus
            />
            <button
              id="safe-word-verify-btn"
              type="submit"
              className="w-full btn-primary text-lg py-3"
            >
              {UI.checkBtn[lang]}
            </button>
          </form>
        )}

        {verifyResult === 'match' && (
          <div className="bg-green-900/30 border border-green-500/30 rounded-xl px-4 py-3 text-green-300 font-semibold text-center">
            {UI.success[lang]}
          </div>
        )}
        {verifyResult === 'fail' && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 font-semibold text-center">
            {UI.fail[lang]}
          </div>
        )}
      </div>
    )
  }

  // Setup mode
  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <span>🔐</span>
          {UI.setupTitle[lang]}
        </h2>
        <p className="text-gray-400 text-xs mt-1 leading-relaxed">{UI.setupDesc[lang]}</p>
      </div>

      {safeWord && !editing ? (
        <div className="flex items-center justify-between bg-green-900/20 border border-green-500/20 rounded-xl px-4 py-3">
          <span className="text-green-400 font-semibold text-sm">{UI.set[lang]}</span>
          <button
            id="safe-word-change-btn"
            onClick={() => { setEditing(true); setInput('') }}
            className="text-gray-400 hover:text-white text-xs underline transition-colors"
          >
            {UI.change[lang]}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <input
            id="safe-word-input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={UI.placeholder[lang]}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white focus:border-raksha-accent focus:outline-none transition-colors"
          />
          <button
            id="safe-word-save-btn"
            type="submit"
            disabled={!input.trim()}
            className="w-full btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {UI.save[lang]}
          </button>
        </form>
      )}

      <p className="text-xs text-gray-600 text-center">
        🔒 {UI.privacy[lang]}
      </p>
    </div>
  )
}
