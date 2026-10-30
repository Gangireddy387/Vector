import type { CallQuality } from './sfu'

/** Packets counted at the previous look, to work out the loss since then. */
export interface StatsSample {
  lost: number
  received: number
}

export interface ConnectionHealth {
  quality: CallQuality
  /** Round trip in milliseconds, when known. */
  rttMs: number | null
  /** Share of incoming packets lost since the previous look, 0–100. */
  lossPercent: number | null
  sample: StatsSample
}

const ORDER: CallQuality[] = ['good', 'fair', 'poor', 'lost']
export const worstQuality = (values: Array<CallQuality | null | undefined>) =>
  values.reduce<CallQuality | null>((worst, value) => (value && (!worst || ORDER.indexOf(value) > ORDER.indexOf(worst)) ? value : worst), null)

export function rate(rttMs: number | null, lossPercent: number | null): CallQuality {
  const rtt = rttMs ?? 0
  const loss = lossPercent ?? 0
  if (rtt < 300 && loss < 2) return 'good'
  if (rtt < 700 && loss < 8) return 'fair'
  return 'poor'
}

/** How a direct connection to one person is doing, from the browser's own statistics. */
export async function measure(pc: RTCPeerConnection, previous: StatsSample | null): Promise<ConnectionHealth | null> {
  if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
    return { quality: 'lost', rttMs: null, lossPercent: null, sample: previous ?? { lost: 0, received: 0 } }
  }
  if (pc.connectionState !== 'connected') return null
  const report = await pc.getStats().catch(() => null)
  if (!report) return null
  let rtt: number | null = null
  let lost = 0
  let received = 0
  let selectedPair: string | null = null
  report.forEach((entry: any) => {
    if (entry.type === 'transport' && entry.selectedCandidatePairId) selectedPair = entry.selectedCandidatePairId
  })
  report.forEach((entry: any) => {
    if (entry.type === 'candidate-pair' && (entry.id === selectedPair || (!selectedPair && entry.nominated && entry.state === 'succeeded'))) {
      if (typeof entry.currentRoundTripTime === 'number') rtt = Math.round(entry.currentRoundTripTime * 1000)
    }
    if (entry.type === 'inbound-rtp') {
      lost += Math.max(0, entry.packetsLost ?? 0)
      received += entry.packetsReceived ?? 0
    }
  })
  const sample = { lost, received }
  let lossPercent: number | null = null
  if (previous) {
    const newLost = Math.max(0, lost - previous.lost)
    const newReceived = Math.max(0, received - previous.received)
    lossPercent = newLost + newReceived > 0 ? Math.round((newLost / (newLost + newReceived)) * 1000) / 10 : 0
  }
  return { quality: rate(rtt, lossPercent), rttMs: rtt, lossPercent, sample }
}
