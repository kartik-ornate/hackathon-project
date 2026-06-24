/**
 * signalMeta.js — shared presentation metadata for all 6 scam signals.

 *
 * Color classes are written out in full so Tailwind's content scanner keeps them.
 */
export const SIGNAL_ORDER = ['urgency', 'authority', 'secrecy', 'threat', 'payment', 'voice_clone']

export const SIGNAL_META = {
  urgency: {
    label: { en: 'Urgency', hi: 'तात्कालिकता' },
    icon: '⏱',
    weight: 15,
    dot: 'bg-amber-400',
    text: 'text-amber-300',
    chip: 'bg-amber-500/10 border-amber-500/30',
    bar: 'bg-amber-500',
    mark: 'bg-amber-500/25 text-amber-100 decoration-amber-400/60',
  },
  authority: {
    label: { en: 'Authority Impersonation', hi: 'प्राधिकरण का दुरुपयोग' },
    icon: '🎖',
    weight: 20,
    dot: 'bg-indigo-400',
    text: 'text-indigo-300',
    chip: 'bg-indigo-500/10 border-indigo-500/30',
    bar: 'bg-indigo-500',
    mark: 'bg-indigo-500/25 text-indigo-100 decoration-indigo-400/60',
  },
  secrecy: {
    label: { en: 'Secrecy / Isolation', hi: 'गोपनीयता' },
    icon: '🤫',
    weight: 20,
    dot: 'bg-violet-400',
    text: 'text-violet-300',
    chip: 'bg-violet-500/10 border-violet-500/30',
    bar: 'bg-violet-500',
    mark: 'bg-violet-500/25 text-violet-100 decoration-violet-400/60',
  },
  threat: {
    label: { en: 'Threat', hi: 'धमकी' },
    icon: '⚠️',
    weight: 20,
    dot: 'bg-orange-400',
    text: 'text-orange-300',
    chip: 'bg-orange-500/10 border-orange-500/30',
    bar: 'bg-orange-500',
    mark: 'bg-orange-500/25 text-orange-100 decoration-orange-400/60',
  },
  payment: {
    label: { en: 'Payment / OTP Extraction', hi: 'भुगतान/ओटीपी मांग' },
    icon: '💳',
    weight: 60,
    dot: 'bg-rose-400',
    text: 'text-rose-300',
    chip: 'bg-rose-500/10 border-rose-500/30',
    bar: 'bg-rose-500',
    mark: 'bg-rose-500/25 text-rose-100 decoration-rose-400/60',
  },
  voice_clone: {
    label: { en: 'AI Voice Clone', hi: 'AI आवाज़ क्लोन' },
    icon: '🎭',
    weight: 80,
    dot: 'bg-fuchsia-400',
    text: 'text-fuchsia-300',
    chip: 'bg-fuchsia-500/10 border-fuchsia-500/30',
    bar: 'bg-fuchsia-500',
    mark: 'bg-fuchsia-500/25 text-fuchsia-100 decoration-fuchsia-400/60',
  },
}
