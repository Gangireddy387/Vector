import { useStorage } from '@vueuse/core'
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { assetUrl } from '@/lib/http'
import type { SoundPreferences } from '@/types/models'

/**
 * Alert sounds and call ringtones, synthesized with Web Audio (nothing to download). People pick their own ringtone,
 * message and notification sounds in Settings when their plan includes custom sounds; everyone else hears the
 * defaults. One tab plays each event, a burst of events plays once, and sounds can be turned off or muted by
 * "Do not disturb".
 */
export type SoundKind = 'message' | 'notification'

/** One note: start offset (s), frequency (Hz) and length (s); optionally a glide to another pitch and its own loudness. */
interface Note {
  at: number
  f: number
  len: number
  to?: number
  level?: number
}

interface Voice {
  wave?: OscillatorType
  /** Overtones: [frequency ratio, loudness]. Whole ratios sound like a marimba, odd ones like a bell. */
  partials?: Array<[number, number]>
}

export interface SoundDefinition extends Voice {
  id: string
  label: string
  description: string
  notes: Note[]
  /** Overall loudness before the person's volume. */
  gain: number
}

export interface RingtoneDefinition extends SoundDefinition {
  /** The phrase repeats this often while the call rings (ms). */
  every: number
}

const MARIMBA: Array<[number, number]> = [
  [1, 0.55],
  [2, 0.2],
  [3, 0.07],
]
const BELL: Array<[number, number]> = [
  [1, 0.5],
  [2.76, 0.12],
  [5.4, 0.05],
]
const SOFT: Array<[number, number]> = [
  [1, 0.6],
  [2, 0.06],
]
const SMALL_BELL: Array<[number, number]> = [
  [1, 1],
  [2, 0.18],
  [3, 0.06],
]

const run = (start: number, step: number, len: number, frequencies: number[]): Note[] =>
  frequencies.map((f, index) => ({ at: start + index * step, f, len }))

/** A soft pluck: mostly the note itself, a touch of octave and a faint shimmer. */
const PLUCK: Array<[number, number]> = [
  [1, 0.6],
  [2, 0.12],
  [4, 0.03],
]
/** A note that repeats quieter and quieter, like an echo off a wall. */
const echoes = (at: number, f: number, count: number, gap: number, len: number): Note[] =>
  Array.from({ length: count }, (_, index) => ({ at: at + index * gap, f, len, level: 0.62 ** index }))

/** Five ringtones in the soft, friendly style of modern work apps (plus silent), all played with a light room echo. */
export const RINGTONES: RingtoneDefinition[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Soft, friendly rising tune',
    notes: [...run(0, 0.14, 0.9, [659.25, 987.77, 1318.51]), ...run(0.62, 0.14, 1.1, [739.99, 987.77, 1479.98])],
    partials: PLUCK,
    gain: 0.9,
    every: 3000,
  },
  {
    id: 'bounce',
    label: 'Bounce',
    description: 'Playful notes that bounce and settle',
    notes: [0, 0.2, 0.36, 0.48, 0.57, 0.64].map((at, index) => ({ at, f: index % 2 ? 783.99 : 1046.5, len: 0.22, level: 1 - index * 0.1 })),
    partials: MARIMBA,
    gain: 0.95,
    every: 2400,
  },
  {
    id: 'dingdong',
    label: 'Ding dong',
    description: 'Classic two-tone chime',
    notes: [
      { at: 0, f: 659.25, len: 1.4 },
      { at: 0.45, f: 523.25, len: 1.9 },
    ],
    partials: BELL,
    gain: 0.95,
    every: 3000,
  },
  {
    id: 'echo',
    label: 'Echo',
    description: 'A clear note that echoes away',
    notes: [...echoes(0, 1174.66, 5, 0.19, 0.45), ...echoes(1.15, 880, 4, 0.19, 0.45)],
    partials: PLUCK,
    gain: 0.85,
    every: 3200,
  },
  {
    id: 'ripple',
    label: 'Ripple',
    description: 'A shimmering, flowing arpeggio',
    notes: [0, 0.75].flatMap((start) => run(start, 0.07, 0.4, [1046.5, 1318.51, 1567.98, 2093, 1567.98, 1318.51])),
    partials: SOFT,
    gain: 0.7,
    every: 2600,
  },
  { id: 'silent', label: 'Silent', description: 'Vibrate only, no sound', notes: [], gain: 0, every: 2600 },
]

export const MESSAGE_SOUNDS: SoundDefinition[] = [
  { id: 'ding', label: 'Ding', description: 'Bright two-note ding', notes: [{ at: 0, f: 880, len: 0.16 }, { at: 0.085, f: 1318.5, len: 0.32 }], partials: SMALL_BELL, gain: 0.32 },
  { id: 'pop', label: 'Pop', description: 'Quick and playful', notes: [{ at: 0, f: 420, to: 940, len: 0.09 }], partials: [[1, 0.9]], gain: 0.42 },
  { id: 'tap', label: 'Tap', description: 'Two light taps', notes: run(0, 0.09, 0.06, [1567.98, 1567.98]), wave: 'triangle', partials: [[1, 0.8]], gain: 0.3 },
  { id: 'bubble', label: 'Bubble', description: 'A soft rising bubble', notes: [{ at: 0, f: 320, to: 1100, len: 0.14 }, { at: 0.1, f: 520, to: 1400, len: 0.1, level: 0.6 }], partials: [[1, 0.8]], gain: 0.34 },
  { id: 'none', label: 'None', description: 'No sound', notes: [], gain: 0 },
]

export const NOTIFICATION_SOUNDS: SoundDefinition[] = [
  { id: 'chime', label: 'Chime', description: 'Soft two-note chime', notes: [{ at: 0, f: 659.25, len: 0.4 }, { at: 0.13, f: 987.77, len: 0.55 }], partials: SMALL_BELL, gain: 0.26 },
  { id: 'glass', label: 'Glass', description: 'A single clear bell', notes: [{ at: 0, f: 1760, len: 0.9 }], partials: BELL, gain: 0.3 },
  { id: 'bright', label: 'Bright', description: 'Three quick rising notes', notes: run(0, 0.08, 0.3, [783.99, 987.77, 1174.66]), partials: SMALL_BELL, gain: 0.24 },
  { id: 'soft', label: 'Soft', description: 'Low and unobtrusive', notes: [{ at: 0, f: 523.25, len: 0.5 }, { at: 0.16, f: 659.25, len: 0.6 }], partials: SOFT, gain: 0.3 },
  { id: 'none', label: 'None', description: 'No sound', notes: [], gain: 0 },
]

export const DEFAULT_SOUNDS: SoundPreferences = { ringtone: 'default', message: 'ding', notification: 'chime', volume: 100 }

const find = <T extends SoundDefinition>(list: T[], id: string | undefined) => list.find((sound) => sound.id === id) ?? list[0]!

/** What plays right now: the person's choices when their plan allows them, otherwise the defaults (volume is always theirs). */
export const activeSounds = ref<SoundPreferences>({ ...DEFAULT_SOUNDS })

/** Called whenever the person's saved choices or their organization's plan change. */
export function applySoundPreferences(saved: Partial<SoundPreferences> | undefined, customAllowed: boolean) {
  const volume = typeof saved?.volume === 'number' ? saved.volume : DEFAULT_SOUNDS.volume
  activeSounds.value = customAllowed ? { ...DEFAULT_SOUNDS, ...saved, volume } : { ...DEFAULT_SOUNDS, volume }
  // Fetch an uploaded ringtone ahead of time so the first ring is instant.
  const { ringtone, customRingtoneUrl } = activeSounds.value
  if (ringtone === CUSTOM_RINGTONE && customRingtoneUrl) void download(assetUrl(customRingtoneUrl)!).catch(() => undefined)
}

/** On by default; saved per device. */
export const soundsEnabled = useStorage('vector.sounds', true)

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

/** Schedules a sound's notes from `start` into `output`. */
function render(ctx: AudioContext, output: AudioNode, sound: SoundDefinition, start: number) {
  for (const note of sound.notes) {
    for (const [ratio, level] of sound.partials ?? SMALL_BELL) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = start + note.at
      const duration = note.len / Math.max(1, ratio * 0.8)
      oscillator.type = sound.wave ?? 'sine'
      oscillator.frequency.setValueAtTime(note.f * ratio, at)
      if (note.to) oscillator.frequency.exponentialRampToValueAtTime(note.to * ratio, at + note.len)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level * (note.level ?? 1)), at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
      oscillator.connect(gain).connect(output)
      oscillator.start(at)
      oscillator.stop(at + duration + 0.05)
    }
  }
}

const loudness = (volume = activeSounds.value.volume) => (volume / 100) ** 1.6

function chime(sound: SoundDefinition, quiet: boolean, volume?: number) {
  if (!sound.notes.length) return
  const ctx = audio()
  if (ctx.state === 'suspended') void ctx.resume()
  const output = ctx.createGain()
  output.gain.value = sound.gain * loudness(volume) * (quiet ? 0.45 : 1)
  output.connect(ctx.destination)
  render(ctx, output, sound, ctx.currentTime + 0.02)
}

const soundFor = (kind: SoundKind) =>
  kind === 'message' ? find(MESSAGE_SOUNDS, activeSounds.value.message) : find(NOTIFICATION_SOUNDS, activeSounds.value.notification)

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
    chime(soundFor(kind), quiet)
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

/** Settings preview: always plays, ignoring the throttle and the gate. Pass an id to hear a sound before choosing it. */
export function previewSound(kind: SoundKind, id?: string, volume?: number) {
  try {
    const sound = id ? find(kind === 'message' ? MESSAGE_SOUNDS : NOTIFICATION_SOUNDS, id) : soundFor(kind)
    chime(sound, false, volume)
  } catch {
    // Audio unsupported.
  }
}

/** The ringtone id for the person's own uploaded tone. */
export const CUSTOM_RINGTONE = 'custom'
/** An uploaded tone rings for at most this long before starting over; the Settings preview plays this much once. */
const CUSTOM_MAX_SECONDS = 30
const PREVIEW_SECONDS = 8

const downloads = new Map<string, Promise<ArrayBuffer>>()
function download(url: string) {
  let bytes = downloads.get(url)
  if (!bytes) {
    bytes = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Ringtone download failed (${response.status})`)
      return response.arrayBuffer()
    })
    downloads.set(url, bytes)
    bytes.catch(() => downloads.delete(url))
  }
  return bytes
}

/** Plays an uploaded audio file as the ringtone; falls back to the default tune if it cannot be played. */
function startCustomRingtone(url: string, volume: number | undefined, once: boolean): () => void {
  let ctx: AudioContext | null = null
  let stopped = false
  let fallback: (() => void) | null = null
  let buzz: ReturnType<typeof setInterval> | null = null
  try {
    ctx = new AudioContext()
  } catch {
    return () => undefined
  }
  const output = ctx.createGain()
  output.gain.value = 0.9 * loudness(volume)
  output.connect(ctx.destination)
  if (!once) {
    navigator.vibrate?.([300, 150, 300])
    buzz = setInterval(() => navigator.vibrate?.([300, 150, 300]), 2600)
  }
  void download(url)
    .then((bytes) => ctx!.decodeAudioData(bytes.slice(0)))
    .then((buffer) => {
      if (stopped || !ctx) return
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(output)
      void ctx.resume()
      if (once) return source.start(0, 0, Math.min(buffer.duration, PREVIEW_SECONDS))
      source.loop = true
      source.loopEnd = Math.min(buffer.duration, CUSTOM_MAX_SECONDS)
      source.start()
    })
    .catch(() => {
      if (!stopped) fallback = startRingtone({ id: RINGTONES[0]!.id, volume, once })
    })
  return () => {
    stopped = true
    if (buzz) clearInterval(buzz)
    if (!once) navigator.vibrate?.(0)
    fallback?.()
    void ctx?.close().catch(() => undefined)
    ctx = null
  }
}

/**
 * Rings until the returned function is called: the person's ringtone repeated, plus vibration on phones.
 * `once` plays a single phrase (the Settings preview). `url` is the uploaded file for the custom ringtone.
 */
export function startRingtone({ id, url, volume, once = false }: { id?: string; url?: string | null; volume?: number; once?: boolean } = {}): () => void {
  const toneId = id ?? activeSounds.value.ringtone
  const customUrl = url ?? activeSounds.value.customRingtoneUrl
  if (toneId === CUSTOM_RINGTONE && customUrl) return startCustomRingtone(assetUrl(customUrl)!, volume, once)
  const tone = find(RINGTONES, toneId)
  let ctx: AudioContext | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let unlockRetry: (() => void) | null = null
  const nodes: AudioNode[] = []
  try {
    // Shared context so the first click inside Vector (including partner iframes) unlocks the ringtone too.
    ctx = audio()
    const compressor = ctx.createDynamicsCompressor()
    const output = ctx.createGain()
    output.gain.value = tone.gain * loudness(volume)
    compressor.connect(output).connect(ctx.destination)
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 0.13
    const feedback = ctx.createGain()
    feedback.gain.value = 0.22
    const wet = ctx.createGain()
    wet.gain.value = 0.28
    output.connect(delay).connect(feedback).connect(delay)
    delay.connect(wet).connect(ctx.destination)
    nodes.push(compressor, output, delay, feedback, wet)
    const ring = () => {
      if (!ctx) return
      if (!once) navigator.vibrate?.([300, 150, 300])
      render(ctx, compressor, tone, ctx.currentTime + 0.05)
    }
    const clearUnlock = () => {
      if (!unlockRetry) return
      window.removeEventListener('pointerdown', unlockRetry, true)
      unlockRetry = null
    }
    const begin = () => {
      if (!ctx) return
      if (ctx.state === 'running') {
        ring()
        return
      }
      void ctx.resume().then(() => {
        if (!ctx) return
        if (ctx.state === 'running') {
          ring()
          return
        }
        // Partner iframes without allow="autoplay" stay muted until a click inside the Vector frame.
        explainBlocked()
        if (unlockRetry || once) return
        unlockRetry = () => {
          void ctx?.resume().then(() => {
            if (ctx?.state === 'running') {
              ring()
              clearUnlock()
            }
          })
        }
        window.addEventListener('pointerdown', unlockRetry, true)
      })
    }
    begin()
    if (!once) timer = setInterval(begin, tone.every)
  } catch {
    ctx = null
  }
  return () => {
    if (!once) navigator.vibrate?.(0)
    if (timer) clearInterval(timer)
    if (unlockRetry) {
      window.removeEventListener('pointerdown', unlockRetry, true)
      unlockRetry = null
    }
    for (const node of nodes) {
      try {
        node.disconnect()
      } catch {
        /* ignore */
      }
    }
    nodes.length = 0
    // Keep the shared AudioContext open for other alerts.
    ctx = null
  }
}
