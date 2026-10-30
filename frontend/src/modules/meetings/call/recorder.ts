/**
 * Records the call in this browser: the call's tab (everyone's video, the shared screen or whiteboard, as this person
 * sees it) together with everyone's voice mixed into one track. The browser asks which tab to record and offers this
 * one first.
 */

export const recordingSupported =
  typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia) && typeof AudioContext !== 'undefined'

const TYPES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']

export interface FinishedRecording {
  blob: Blob
  mimeType: string
  durationSeconds: number
}

export interface CallRecorder {
  /** The voices to mix in now (they change as people join, leave or switch microphones). */
  setAudio: (tracks: MediaStreamTrack[]) => void
  stop: () => Promise<FinishedRecording>
}

/** `onEnded`: the person stopped sharing the tab from the browser's own bar, which ends the recording too. */
export async function startRecorder(onEnded: () => void): Promise<CallRecorder> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 24, max: 30 } },
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
  } as DisplayMediaStreamOptions)
  const video = display.getVideoTracks()[0]
  if (!video) {
    display.getTracks().forEach((track) => track.stop())
    throw new Error('Nothing to record was chosen.')
  }

  const context = new AudioContext()
  const mix = context.createMediaStreamDestination()
  // A silent source keeps the audio track running while nobody speaks (some recorders drop a silent track).
  const silence = context.createConstantSource()
  const quiet = context.createGain()
  quiet.gain.value = 0
  silence.connect(quiet).connect(mix)
  silence.start()
  const sources = new Map<string, MediaStreamAudioSourceNode>()

  function setAudio(tracks: MediaStreamTrack[]) {
    const wanted = new Map(tracks.filter((track) => track.readyState === 'live').map((track) => [track.id, track]))
    for (const [id, source] of sources) {
      if (wanted.has(id)) continue
      source.disconnect()
      sources.delete(id)
    }
    for (const [id, track] of wanted) {
      if (sources.has(id)) continue
      const source = context.createMediaStreamSource(new MediaStream([track]))
      source.connect(mix)
      sources.set(id, source)
    }
  }

  const mimeType = TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
  const recorder = new MediaRecorder(new MediaStream([video, ...mix.stream.getAudioTracks()]), {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 1_500_000,
    audioBitsPerSecond: 96_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data)
  const startedAt = Date.now()
  recorder.start(1000)
  let stopping: Promise<FinishedRecording> | null = null

  function stop() {
    stopping ??= new Promise<FinishedRecording>((resolve) => {
      recorder.onstop = () => {
        display.getTracks().forEach((track) => track.stop())
        sources.forEach((source) => source.disconnect())
        silence.stop()
        void context.close().catch(() => undefined)
        const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0]!
        resolve({ blob: new Blob(chunks, { type }), mimeType: type, durationSeconds: Math.round((Date.now() - startedAt) / 1000) })
      }
      if (recorder.state === 'inactive') recorder.onstop?.(new Event('stop'))
      else recorder.stop()
    })
    return stopping
  }

  video.addEventListener('ended', onEnded)
  return { setAudio, stop }
}
