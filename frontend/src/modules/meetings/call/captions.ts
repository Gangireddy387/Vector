/**
 * Live captions: the browser's speech recognition turns this person's own speech into text, which the call shares
 * with the others and keeps as the meeting's transcript. Chrome, Edge and Safari can do it (Chrome sends the audio
 * to Google's speech service); in other browsers this person's speech is simply not captioned.
 */

interface RecognitionAlternative {
  transcript: string
}
interface RecognitionResult {
  isFinal: boolean
  0: RecognitionAlternative
}
interface RecognitionEvent {
  resultIndex: number
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: RecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

const Recognizer: RecognitionConstructor | null =
  typeof window === 'undefined' ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)

export const captionsSupported = Boolean(Recognizer)

export interface CaptionPart {
  /** The same id while a sentence grows; a new one for the next sentence. */
  id: string
  text: string
  final: boolean
}

const INTERIM_EVERY_MS = 350

export function createCaptioner(onPart: (part: CaptionPart) => void, onBlocked: (reason: string) => void) {
  let recognition: Recognition | null = null
  let wanted = false
  let session = 0
  let language = navigator.language || 'en-US'
  const lastInterim = new Map<string, number>()
  /** Keeps ids apart between people and page loads. */
  const prefix = Math.random().toString(36).slice(2, 10)

  function begin() {
    if (!Recognizer || !wanted) return
    session += 1
    const current = session
    const next = new Recognizer()
    next.lang = language
    next.continuous = true
    next.interimResults = true
    next.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!
        const text = result[0].transcript.trim()
        if (!text) continue
        const id = `${current}-${index}`
        const now = Date.now()
        if (!result.isFinal && now - (lastInterim.get(id) ?? 0) < INTERIM_EVERY_MS) continue
        lastInterim.set(id, now)
        if (result.isFinal) lastInterim.delete(id)
        onPart({ id: `${prefix}-${id}`, text, final: result.isFinal })
      }
    }
    next.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wanted = false
        onBlocked('Captions need permission to use speech recognition in this browser.')
      }
    }
    // Recognition stops by itself after a pause or a minute; keep it going while captions are on.
    next.onend = () => {
      if (wanted && recognition === next) setTimeout(begin, 250)
    }
    recognition = next
    try {
      next.start()
    } catch {
      // Already starting.
    }
  }

  return {
    start(lang?: string) {
      if (lang) language = lang
      if (wanted) return
      wanted = true
      begin()
    },
    stop() {
      wanted = false
      const current = recognition
      recognition = null
      current?.abort()
    },
    setLanguage(lang: string) {
      language = lang
      if (wanted) {
        recognition?.abort()
        recognition = null
        begin()
      }
    },
  }
}
