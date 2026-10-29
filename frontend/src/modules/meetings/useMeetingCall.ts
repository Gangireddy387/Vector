import type { Socket } from 'socket.io-client'
import { onBeforeUnmount, reactive, ref, shallowRef, triggerRef } from 'vue'
import { getSocket } from '@/lib/realtime'
import type { UserSummary } from '@/types/models'
import { meetingsApi } from './meetings.api'

export interface MediaState {
  audio: boolean
  video: boolean
  screen: boolean
}

export type PeerConnection = RTCPeerConnectionState

export interface CallPeer {
  socketId: string
  user: UserSummary
  media: MediaState
  stream: MediaStream | null
  /** Bumped whenever a track arrives or resumes, so the tile re-attaches its video. */
  revision: number
  connection: PeerConnection
}

interface Connection {
  pc: RTCPeerConnection
  /** Perfect negotiation: the polite side gives way when both start a negotiation at the same moment. */
  polite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
  /** One sender per kind, reused when the camera or screen changes so no new negotiation is needed. */
  senders: { audio?: RTCRtpSender; video?: RTCRtpSender }
  restartTimer?: ReturnType<typeof setTimeout>
}

type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
type JoinResult = { ok: boolean; error?: string; selfId?: string; peers?: Array<Omit<CallPeer, 'stream' | 'revision' | 'connection'>> }

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export const mediaSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
export const canShareScreen = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)

/** A sentence the person can act on, for a failed camera or microphone request. */
export function deviceProblem(error: unknown, device: string) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return `Vector is not allowed to use your ${device}. Click the lock icon next to the web address, allow the ${device}, then try again.`
  }
  if (name === 'NotReadableError' || name === 'AbortError' || name === 'TrackStartError') {
    return `Your ${device} is being used by another app (such as Teams or Zoom) or by Windows privacy settings. Close that app and try again.`
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `No ${device} was found on this device.`
  return `Could not start your ${device}.`
}

let iceCache: { servers: RTCIceServer[]; expiresAt: number } | null = null
async function iceServers() {
  if (iceCache && iceCache.expiresAt - Date.now() > 5 * 60_000) return iceCache.servers
  try {
    const result = await meetingsApi.iceServers()
    iceCache = { servers: result.iceServers.length ? result.iceServers : FALLBACK_ICE, expiresAt: Date.now() + result.ttlSeconds * 1000 }
  } catch {
    iceCache = { servers: FALLBACK_ICE, expiresAt: Date.now() + 10 * 60_000 }
  }
  return iceCache.servers
}

/**
 * A browser-to-browser video call: the camera and microphone stay on this device, and each person in the call gets a
 * direct connection to every other person (through a TURN relay when their network blocks direct ones). The server
 * only passes connection details along.
 */
export function useMeetingCall() {
  const localStream = shallowRef<MediaStream | null>(null)
  const localRevision = ref(0)
  const screenStream = shallowRef<MediaStream | null>(null)
  const media = reactive<MediaState>({ audio: false, video: false, screen: false })
  const peers = ref<CallPeer[]>([])
  const status = ref<'idle' | 'preview' | 'joining' | 'joined' | 'reconnecting' | 'left'>('idle')
  const deviceNote = ref<string | null>(null)
  const callError = ref<string | null>(null)
  const selfId = ref<string | null>(null)
  const connections = new Map<string, Connection>()
  /** Media that arrives before the person is listed waits here until their tile exists. */
  const streams = new Map<string, MediaStream>()
  let meetingId: string | null = null
  let boundSocket: Socket | null = null
  let socketWatch: ReturnType<typeof setInterval> | null = null
  let rtcConfig: RTCConfiguration = { iceServers: FALLBACK_ICE }

  const audioTrack = () => localStream.value?.getAudioTracks()[0] ?? null
  const cameraTrack = () => localStream.value?.getVideoTracks()[0] ?? null
  const outgoingVideo = () => screenStream.value?.getVideoTracks()[0] ?? cameraTrack()
  const touchLocal = () => {
    localRevision.value += 1
    triggerRef(localStream)
  }

  /** Asks for camera and microphone; falls back to one of them, then to joining without devices. */
  async function startPreview() {
    if (localStream.value) return
    if (!mediaSupported) {
      localStream.value = new MediaStream()
      deviceNote.value = window.isSecureContext
        ? 'This browser cannot make video calls. Use a current version of Chrome, Edge, Firefox or Safari.'
        : 'Video calls need a secure (https://) address. Open Vector over https to use your camera and microphone.'
      status.value = 'preview'
      return
    }
    let firstError: unknown = null
    for (const constraints of [{ audio: AUDIO, video: VIDEO }, { audio: AUDIO }, { video: VIDEO }] as MediaStreamConstraints[]) {
      try {
        localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
        break
      } catch (error) {
        firstError ??= error
      }
    }
    if (!localStream.value) {
      localStream.value = new MediaStream()
      deviceNote.value = `${deviceProblem(firstError, 'camera and microphone')} You can still join to watch and listen.`
    } else if (!cameraTrack()) {
      deviceNote.value = `${deviceProblem(firstError, 'camera')} You will join with your microphone.`
    } else if (!audioTrack()) {
      deviceNote.value = `${deviceProblem(firstError, 'microphone')} Others will see you but not hear you.`
    }
    media.audio = Boolean(audioTrack())
    media.video = Boolean(cameraTrack())
    touchLocal()
    status.value = 'preview'
  }

  const send = (to: string, data: Signal) => boundSocket?.emit('meeting:signal', { to, data })
  const shareMedia = () => boundSocket?.emit('meeting:media', { ...media })

  function updatePeer(socketId: string, changes: Partial<CallPeer> | ((peer: CallPeer) => Partial<CallPeer>)) {
    peers.value = peers.value.map((peer) => (peer.socketId === socketId ? { ...peer, ...(typeof changes === 'function' ? changes(peer) : changes) } : peer))
  }

  async function attach(connection: Connection, kind: 'audio' | 'video', track: MediaStreamTrack | null) {
    const sender = connection.senders[kind]
    if (sender) {
      if (sender.track !== track) await sender.replaceTrack(track).catch(() => undefined)
    } else if (track) {
      connection.senders[kind] = connection.pc.addTrack(track, localStream.value ?? new MediaStream([track]))
    }
  }

  /** Sends the current microphone and camera/screen to everyone (after a device or screen change). */
  async function refreshOutgoing() {
    for (const connection of connections.values()) {
      await attach(connection, 'audio', audioTrack())
      await attach(connection, 'video', outgoingVideo())
    }
  }

  function scheduleIceRestart(connection: Connection, delay: number) {
    clearTimeout(connection.restartTimer)
    connection.restartTimer = setTimeout(() => {
      const state = connection.pc.connectionState
      if (state === 'failed' || state === 'disconnected') connection.pc.restartIce()
    }, delay)
  }

  function connect(peerId: string) {
    const existing = connections.get(peerId)
    if (existing) return existing
    const pc = new RTCPeerConnection(rtcConfig)
    const connection: Connection = { pc, polite: (selfId.value ?? '') < peerId, makingOffer: false, ignoreOffer: false, senders: {} }
    connections.set(peerId, connection)
    void attach(connection, 'audio', audioTrack())
    void attach(connection, 'video', outgoingVideo())

    pc.onicecandidate = (event) => event.candidate && send(peerId, { candidate: event.candidate.toJSON() })
    pc.ontrack = (event) => {
      const stream = streams.get(peerId) ?? new MediaStream()
      for (const old of stream.getTracks()) if (old.kind === event.track.kind && old !== event.track) stream.removeTrack(old)
      if (!stream.getTracks().includes(event.track)) stream.addTrack(event.track)
      streams.set(peerId, stream)
      const bump = () => updatePeer(peerId, (peer) => ({ stream, revision: peer.revision + 1 }))
      event.track.onunmute = bump
      bump()
    }
    pc.onconnectionstatechange = () => {
      updatePeer(peerId, { connection: pc.connectionState })
      if (pc.connectionState === 'failed') scheduleIceRestart(connection, 0)
      if (pc.connectionState === 'disconnected') scheduleIceRestart(connection, 3000)
    }
    pc.onnegotiationneeded = async () => {
      try {
        connection.makingOffer = true
        await pc.setLocalDescription()
        send(peerId, { description: pc.localDescription!.toJSON() })
      } catch {
        // A later negotiation retries.
      } finally {
        connection.makingOffer = false
      }
    }
    return connection
  }

  async function onSignal({ from, data }: { from: string; data: Signal }) {
    const connection = connections.get(from) ?? connect(from)
    const { pc } = connection
    try {
      if (data.description) {
        const collision = data.description.type === 'offer' && (connection.makingOffer || pc.signalingState !== 'stable')
        connection.ignoreOffer = !connection.polite && collision
        if (connection.ignoreOffer) return
        await pc.setRemoteDescription(data.description)
        if (data.description.type === 'offer') {
          await pc.setLocalDescription()
          send(from, { description: pc.localDescription!.toJSON() })
        }
      } else if (data.candidate) {
        await pc.addIceCandidate(data.candidate).catch((error) => {
          if (!connection.ignoreOffer) throw error
        })
      }
    } catch {
      // Network hiccups are retried by the next negotiation or ICE restart.
    }
  }

  function dropPeer(socketId: string) {
    const connection = connections.get(socketId)
    if (connection) {
      clearTimeout(connection.restartTimer)
      connection.pc.close()
    }
    connections.delete(socketId)
    streams.delete(socketId)
    peers.value = peers.value.filter((peer) => peer.socketId !== socketId)
  }

  const listed = (peer: Omit<CallPeer, 'stream' | 'revision' | 'connection'>): CallPeer => ({
    ...peer,
    stream: streams.get(peer.socketId) ?? null,
    revision: 0,
    connection: connections.get(peer.socketId)?.pc.connectionState ?? 'new',
  })

  const onPeerJoined = (peer: Omit<CallPeer, 'stream' | 'revision' | 'connection'>) => {
    if (peers.value.some((item) => item.socketId === peer.socketId)) return
    peers.value = [...peers.value, listed(peer)]
    connect(peer.socketId)
  }
  const onPeerLeft = ({ socketId }: { socketId: string }) => dropPeer(socketId)
  const onPeerMedia = ({ socketId, media: next }: { socketId: string; media: MediaState }) => updatePeer(socketId, { media: next })
  const onSocketDown = () => {
    if (status.value === 'joined') status.value = 'reconnecting'
  }
  const onSocketUp = () => {
    if (status.value === 'reconnecting' || status.value === 'joined') void rejoin()
  }

  const HANDLERS = {
    'meeting:signal': onSignal,
    'meeting:peer-joined': onPeerJoined,
    'meeting:peer-left': onPeerLeft,
    'meeting:peer-media': onPeerMedia,
    disconnect: onSocketDown,
    connect: onSocketUp,
  } as const

  function bind(socket: Socket | null) {
    for (const [event, handler] of Object.entries(HANDLERS)) boundSocket?.off(event, handler as (...args: any[]) => void)
    boundSocket = socket
    for (const [event, handler] of Object.entries(HANDLERS)) boundSocket?.on(event, handler as (...args: any[]) => void)
  }

  function enterRoom(socket: Socket) {
    return new Promise<JoinResult>((resolve) =>
      socket.timeout(10_000).emit('meeting:join', { meetingId, media: { ...media } }, (error: Error | null, response: JoinResult) =>
        resolve(error ? { ok: false, error: 'The meeting did not answer. Check your connection and try again.' } : response),
      ),
    )
  }

  function closeConnections() {
    for (const socketId of [...connections.keys()]) dropPeer(socketId)
    peers.value = []
  }

  /** After the connection to Vector drops and comes back: the server forgot this call, so join it again. */
  async function rejoin() {
    const socket = getSocket()
    if (!socket || !meetingId) return
    if (socket !== boundSocket) bind(socket)
    if (!socket.connected) {
      status.value = 'reconnecting'
      return
    }
    closeConnections()
    selfId.value = socket.id ?? null
    const result = await enterRoom(socket)
    if (!result.ok) {
      callError.value = result.error ?? 'You were disconnected from the call.'
      leave()
      return
    }
    selfId.value = result.selfId ?? selfId.value
    peers.value = (result.peers ?? []).map(listed)
    peers.value.forEach((peer) => connect(peer.socketId))
    shareMedia()
    status.value = 'joined'
  }

  /** Joins the call: everyone already in it is connected to, and they connect back. */
  async function join(id: string) {
    const socket = getSocket()
    if (!socket?.connected) throw new Error('Not connected to Vector. Check your internet connection and try again.')
    if (!localStream.value) await startPreview()
    meetingId = id
    callError.value = null
    status.value = 'joining'
    rtcConfig = { iceServers: await iceServers() }
    bind(socket)
    selfId.value = socket.id ?? null
    const result = await enterRoom(socket)
    if (!result.ok) {
      bind(null)
      meetingId = null
      status.value = 'preview'
      throw new Error(result.error ?? 'Could not join the meeting')
    }
    selfId.value = result.selfId ?? selfId.value
    peers.value = (result.peers ?? []).map(listed)
    peers.value.forEach((peer) => connect(peer.socketId))
    status.value = 'joined'
    // The app may replace its connection (e.g. after signing in again); follow it so the call survives.
    socketWatch = setInterval(() => {
      const current = getSocket()
      if (current && current !== boundSocket) void rejoin()
    }, 3000)
  }

  async function requestTrack(kind: 'audio' | 'video') {
    if (!mediaSupported) throw new Error(deviceNote.value ?? 'This browser cannot use a camera or microphone here.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: AUDIO } : { video: VIDEO })
      const track = stream.getTracks()[0]!
      if (!localStream.value) localStream.value = new MediaStream()
      localStream.value.addTrack(track)
      touchLocal()
      return track
    } catch (error) {
      throw new Error(deviceProblem(error, kind === 'audio' ? 'microphone' : 'camera'))
    }
  }

  /** Mutes or unmutes; asks for the microphone first when it was not allowed or found before. */
  async function toggleAudio() {
    if (!audioTrack()) {
      await requestTrack('audio')
      media.audio = true
      deviceNote.value = cameraTrack() ? null : deviceNote.value
    } else {
      media.audio = !media.audio
      audioTrack()!.enabled = media.audio
    }
    await refreshOutgoing()
    shareMedia()
  }

  /** Turning the camera off releases it (its light goes out); turning it on asks for it again. */
  async function toggleVideo() {
    if (media.video) {
      const track = cameraTrack()
      media.video = false
      if (track) {
        track.stop()
        localStream.value!.removeTrack(track)
        touchLocal()
      }
    } else {
      await requestTrack('video')
      media.video = true
      deviceNote.value = audioTrack() ? null : deviceNote.value
    }
    await refreshOutgoing()
    shareMedia()
  }

  async function stopScreenShare() {
    screenStream.value?.getTracks().forEach((track) => track.stop())
    screenStream.value = null
    media.screen = false
    await refreshOutgoing()
    shareMedia()
  }

  async function toggleScreenShare() {
    if (media.screen) return stopScreenShare()
    if (!canShareScreen) throw new Error('This device cannot share its screen.')
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false })
      screenStream.value = stream
      media.screen = true
      const [track] = stream.getVideoTracks()
      if (track) {
        track.contentHint = 'detail'
        track.onended = () => void stopScreenShare()
      }
      await refreshOutgoing()
      shareMedia()
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      throw new Error('Could not share your screen.')
    }
  }

  /** Leaves the call and releases the camera and microphone. */
  function leave() {
    if (meetingId && (status.value === 'joined' || status.value === 'reconnecting')) boundSocket?.emit('meeting:leave')
    if (socketWatch) clearInterval(socketWatch)
    socketWatch = null
    bind(null)
    closeConnections()
    screenStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value?.getTracks().forEach((track) => track.stop())
    screenStream.value = null
    localStream.value = null
    media.audio = false
    media.video = false
    media.screen = false
    meetingId = null
    status.value = 'left'
  }

  onBeforeUnmount(leave)

  return {
    localStream,
    localRevision,
    screenStream,
    media,
    peers,
    status,
    deviceNote,
    callError,
    startPreview,
    join,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    leave,
  }
}
