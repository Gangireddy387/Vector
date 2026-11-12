import { useStorage } from '@vueuse/core'
import { toast } from 'vue-sonner'

/**
 * Short alert sounds, synthesized with Web Audio (nothing to download): a bright two-note "ding" for messages and a
 * softer chime for notifications. One tab plays each event, a burst of events plays once, and the person can turn
 * sounds off in Settings or by choosing "Do not disturb".
 */
export type SoundKind = 'message' | 'notification'

/** On by default; saved per device. */
export const soundsEnabled = useStorage('vector.sounds', true)

/** Each note: start offset (s), frequency (Hz), length (s). */
const TONES: Record<SoundKind, Array<[number, number, number]>> = {
  message: [
    [0, 880, 0.16],
    [0.085, 1318.5, 0.32],
  ],
  notification: [
    [0, 659.25, 0.4],
    [0.13, 987.77, 0.55],
  ],
}
const VOLUME: Record<SoundKind, number> = { message: 0.32, notification: 0.26 }
/** Overtones that make a sine sound like a small bell instead of a beep. */
const PARTIALS: Array<[number, number]> = [
  [1, 1],
  [2, 0.18],
  [3, 0.06],
]
const MIN_GAP_MS = 900
const CLAIM_KEY = 'vector.sound.claim'

let context: AudioContext | null = null
let lastPlayedAt = 0
let gate: () => boolean = () => true

/** Lets the app mute alerts in situations it knows about, e.g. "Do not disturb". Return false to stay quiet. */
export function setSoundGate(allow: () => boolean) {
  gate = allow
}

function audio() {
  context ??= new AudioContext()
  return context
}

// Browsers only allow sound after the person has interacted with the page once.
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      void audio().resume()
    } catch {
      // Audio unsupported: alerts stay silent.
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
}

function chime(kind: SoundKind, quiet: boolean) {
  const ctx = audio()
  if (ctx.state === 'suspended') void ctx.resume()
  const output = ctx.createGain()
  output.gain.value = VOLUME[kind] * (quiet ? 0.45 : 1)
  output.connect(ctx.destination)
  const start = ctx.currentTime + 0.02
  for (const [offset, frequency, length] of TONES[kind]) {
    for (const [ratio, level] of PARTIALS) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = start + offset
      const duration = length / ratio
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency * ratio
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(level, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(output)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
    }
  }
}

/** True when this tab may play the event: the visible tab claims it first, background tabs only if nobody did. */
function claim(id: string) {
  try {
    const previous = JSON.parse(localStorage.getItem(CLAIM_KEY) ?? 'null') as { id: string; at: number } | null
    if (previous?.id === id && Date.now() - previous.at < 5000) return false
    localStorage.setItem(CLAIM_KEY, JSON.stringify({ id, at: Date.now() }))
  } catch {
    // Storage unavailable: every tab plays, which is still better than none.
  }
  return true
}

function play(kind: SoundKind, id: string | undefined, quiet: boolean) {
  const now = Date.now()
  if (now - lastPlayedAt < MIN_GAP_MS) return
  if (id && !claim(id)) return
  lastPlayedAt = now
  try {
    chime(kind, quiet)
  } catch {
    // Audio unsupported or blocked: stay silent.
  }
}

/**
 * Plays an alert for a new message or notification. `id` keeps several open tabs from all playing the same event;
 * `quiet` is for messages arriving in the conversation already on screen.
 */
export function playSound(kind: SoundKind, { id, quiet = false }: { id?: string; quiet?: boolean } = {}) {
  if (!soundsEnabled.value || !gate()) return
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) return explainBlocked()
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return play(kind, id, quiet)
  window.setTimeout(() => play(kind, id, quiet), 250)
}

let blockedExplained = false

/** Browsers mute a freshly opened page until it is clicked or typed in; say so once instead of staying silent. */
function explainBlocked() {
  if (blockedExplained) return
  blockedExplained = true
  toast.info('Sounds start after your first click', { description: 'Your browser keeps a new page quiet until you click or type in it once.' })
}

/** Settings preview: always plays, ignoring the throttle and the gate. */
export function previewSound(kind: SoundKind) {
  try {
    chime(kind, false)
  } catch {
    // Audio unsupported.
  }
}
