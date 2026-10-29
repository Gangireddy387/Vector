import type { ImageSegmenter } from '@mediapipe/tasks-vision'
import wasmBinaryPath from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'
import wasmLoaderPath from '@mediapipe/tasks-vision/vision_wasm_internal.js?url'

const MODEL_URL = '/models/selfie_segmenter.tflite'
const FPS = 24
const BLUR_PX = 14

export const blurSupported =
  typeof window !== 'undefined' && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype && typeof WebAssembly === 'object'

let segmenter: Promise<ImageSegmenter> | null = null

/** The person-finding model runs on this device; it is loaded the first time someone turns blur on. */
function loadSegmenter() {
  segmenter ??= (async () => {
    const { ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const fileset = { wasmLoaderPath, wasmBinaryPath }
    const options = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO' as const,
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    })
    try {
      return await ImageSegmenter.createFromOptions(fileset, options('GPU'))
    } catch {
      return await ImageSegmenter.createFromOptions(fileset, options('CPU'))
    }
  })()
  segmenter.catch(() => (segmenter = null))
  return segmenter
}

/** Timers in a worker keep running when the tab is in the background, unlike the page's own timers. */
function workerTicker(intervalMs: number, tick: () => void) {
  const source = `let id; onmessage = (e) => { clearInterval(id); if (e.data > 0) id = setInterval(() => postMessage(0), e.data) }`
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
  const worker = new Worker(url)
  worker.onmessage = tick
  worker.postMessage(intervalMs)
  return () => {
    worker.postMessage(0)
    worker.terminate()
    URL.revokeObjectURL(url)
  }
}

export interface BlurredCamera {
  track: MediaStreamTrack
  stop: () => void
}

/**
 * Returns a copy of the camera with the background blurred: each frame, the model finds the person, the frame is
 * drawn blurred and the person is drawn sharp on top. Everything happens in this browser.
 */
export async function blurBackground(camera: MediaStreamTrack): Promise<BlurredCamera> {
  const model = await loadSegmenter()
  const settings = camera.getSettings()
  const width = settings.width ?? 1280
  const height = settings.height ?? 720

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = new MediaStream([camera])
  await video.play()

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const context = output.getContext('2d')!
  const maskCanvas = document.createElement('canvas')
  const maskContext = maskCanvas.getContext('2d')!
  let maskPixels: ImageData | null = null

  let lastTime = -1
  function draw() {
    if (video.readyState < 2 || camera.readyState !== 'live') return
    const now = performance.now()
    if (now <= lastTime) return
    lastTime = now
    const result = model.segmentForVideo(video, now)
    try {
      const masks = result.confidenceMasks ?? []
      const person = masks.length > 1 ? masks[1] : masks[0]
      if (!person) return
      const values = person.getAsFloat32Array()
      if (maskCanvas.width !== person.width || maskCanvas.height !== person.height || !maskPixels) {
        maskCanvas.width = person.width
        maskCanvas.height = person.height
        maskPixels = maskContext.createImageData(person.width, person.height)
      }
      const pixels = maskPixels.data
      for (let index = 0; index < values.length; index += 1) pixels[index * 4 + 3] = Math.round((values[index] ?? 0) * 255)
      maskContext.putImageData(maskPixels, 0, 0)

      context.save()
      context.globalCompositeOperation = 'copy'
      context.filter = 'blur(3px)'
      context.drawImage(maskCanvas, 0, 0, width, height)
      context.filter = 'none'
      context.globalCompositeOperation = 'source-in'
      context.drawImage(video, 0, 0, width, height)
      context.globalCompositeOperation = 'destination-over'
      context.filter = `blur(${BLUR_PX}px)`
      context.drawImage(video, 0, 0, width, height)
      context.restore()
    } finally {
      result.close()
    }
  }

  const stopTicker = workerTicker(1000 / FPS, draw)
  const track = output.captureStream(FPS).getVideoTracks()[0]!
  track.contentHint = 'motion'

  return {
    track,
    stop: () => {
      stopTicker()
      track.stop()
      video.pause()
      video.srcObject = null
    },
  }
}
