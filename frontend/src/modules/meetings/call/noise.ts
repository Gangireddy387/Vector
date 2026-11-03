import rnnoiseWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import rnnoiseSimdWasmPath from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'
import rnnoiseWorkletPath from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'

/**
 * AI noise suppression: a small neural network (RNNoise) removes keyboard clicks, fans, traffic and other background
 * noise from this person's microphone before anyone hears it. It runs in this browser; no audio leaves for it.
 */

export const noiseSupported = typeof window !== 'undefined' && typeof AudioWorkletNode !== 'undefined' && typeof WebAssembly === 'object'

let wasm: Promise<ArrayBuffer> | null = null

export interface CleanMicrophone {
  track: MediaStreamTrack
  stop: () => void
}

/** A copy of the microphone with the background noise removed. */
export async function suppressNoise(microphone: MediaStreamTrack): Promise<CleanMicrophone> {
  const library = await import('@sapphi-red/web-noise-suppressor')
  wasm ??= library.loadRnnoise({ url: rnnoiseWasmPath, simdUrl: rnnoiseSimdWasmPath })
  wasm.catch(() => (wasm = null))
  // RNNoise works on 48 kHz audio.
  const context = new AudioContext({ sampleRate: 48_000 })
  try {
    await context.audioWorklet.addModule(rnnoiseWorkletPath)
    const source = context.createMediaStreamSource(new MediaStream([microphone]))
    const filter = new library.RnnoiseWorkletNode(context, { wasmBinary: await wasm, maxChannels: 1 })
    const destination = context.createMediaStreamDestination()
    source.connect(filter).connect(destination)
    if (context.state === 'suspended') await context.resume().catch(() => undefined)
    const track = destination.stream.getAudioTracks()[0]!
    return {
      track,
      stop: () => {
        source.disconnect()
        filter.disconnect()
        filter.destroy()
        track.stop()
        void context.close().catch(() => undefined)
      },
    }
  } catch (error) {
    void context.close().catch(() => undefined)
    throw error
  }
}
