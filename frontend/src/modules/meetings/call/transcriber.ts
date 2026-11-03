/**
 * AI notes: records short pieces of one person's speech (their microphone, or a phone caller's audio) and hands them
 * over to be turned into text on the server. A piece starts before the first word (the recorder is always running)
 * and ends at a pause, so sentences stay whole; silence is never sent.
 */

export const aiNotesSupported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined'

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
const mimeType = () => (aiNotesSupported ? (TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '') : '')

const CHECK_MS = 100
const SPEECH_LEVEL = 0.02
const PAUSE_MS = 900
const MIN_PIECE_MS = 1200
const MAX_PIECE_MS = 25_000
const MAX_SILENCE_MS = 15_000

export interface SpeechPiece {
  audio: Blob
  mimeType: string
  durationMs: number
}

export interface SpeechRecorder {
  stop: () => void
}

interface Piece {
  recorder: MediaRecorder
  startedAt: number
  /** Whether it is sent when it stops (pieces with only silence are not). */
  keep: boolean
}

export function recordSpeech(track: MediaStreamTrack, onPiece: (piece: SpeechPiece) => void): SpeechRecorder {
  const type = mimeType()
  const context = new AudioContext()
  const source = context.createMediaStreamSource(new MediaStream([track]))
  const analyser = context.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const samples = new Uint8Array(analyser.fftSize)

  let current: Piece | null = null
  let spoke = false
  let lastVoice = 0
  let stopped = false

  function begin() {
    if (stopped || track.readyState !== 'live') return
    const chunks: Blob[] = []
    const recorder = new MediaRecorder(new MediaStream([track]), { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 32_000 })
    const piece: Piece = { recorder, startedAt: Date.now(), keep: false }
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
    recorder.onstop = () => {
      if (!piece.keep || !chunks.length) return
      const kind = recorder.mimeType || type
      onPiece({ audio: new Blob(chunks, { type: kind }), mimeType: kind, durationMs: Date.now() - piece.startedAt })
    }
    recorder.start()
    current = piece
    spoke = false
  }

  function cut(keep: boolean, again = true) {
    const piece = current
    current = null
    if (piece && piece.recorder.state !== 'inactive') {
      piece.keep = keep
      piece.recorder.stop()
    }
    if (again) begin()
  }

  function level() {
    analyser.getByteTimeDomainData(samples)
    let sum = 0
    for (const value of samples) sum += ((value - 128) / 128) ** 2
    return Math.sqrt(sum / samples.length)
  }

  const timer = setInterval(() => {
    if (!current) return begin()
    const now = Date.now()
    if (track.enabled && level() > SPEECH_LEVEL) {
      spoke = true
      lastVoice = now
    }
    const age = now - current.startedAt
    if (spoke && ((now - lastVoice > PAUSE_MS && age > MIN_PIECE_MS) || age > MAX_PIECE_MS)) cut(true)
    else if (!spoke && age > MAX_SILENCE_MS) cut(false)
  }, CHECK_MS)

  void context.resume().catch(() => undefined)
  begin()

  return {
    stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      cut(spoke, false)
      source.disconnect()
      void context.close().catch(() => undefined)
    },
  }
}
