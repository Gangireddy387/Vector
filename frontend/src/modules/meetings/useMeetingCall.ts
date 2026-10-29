import type { Socket } from 'socket.io-client'
import { computed, reactive, ref, shallowRef, triggerRef } from 'vue'
import { getSocket } from '@/lib/realtime'
import type { UserSummary } from '@/types/models'
import { type BlurredCamera, blurBackground, blurSupported } from './call/background-blur'
import { type MeetingPoll, type WhiteboardStroke, meetingsApi } from './meetings.api'

export interface MediaState {
  audio: boolean
  video: boolean
  screen: boolean
}

export type PeerConnection = RTCPeerConnectionState

/** People in a call: organization members, or guests who came with the meeting's guest link. */
export type CallUser = UserSummary

interface PeerInfo {
  socketId: string
  user: CallUser
  media: MediaState
  /** When the hand went up (people are called on in that order), or null. */
  hand: number | null
  room: string | null
  guest: boolean
}

export interface CallPeer extends PeerInfo {
  stream: MediaStream | null
  /** Bumped whenever a track arrives or resumes, so the tile re-attaches its video. */
  revision: number
  connection: PeerConnection
}

export interface ChatMessage {
  id: string
  at: string
  author: CallUser
  body: string
  room: string | null
  /** Sent by the host to every breakout room. */
  broadcast: boolean
}

export interface LobbyGuest {
  socketId: string
  user: CallUser
  since: string
}

export interface BreakoutState {
  rooms: Array<{ id: string; name: string; people: Array<{ socketId: string; user: CallUser }> }>
  main: Array<{ socketId: string; user: CallUser }>
}

export interface FloatingReaction {
  key: number
  /** 'self' or a peer's socket id. */
  tileId: string
  emoji: string
}

export type BoardEvent = { type: 'stroke'; stroke: WhiteboardStroke; points: number[] } | { type: 'remove'; id: string } | { type: 'reset' }

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
type JoinResult = {
  ok: boolean
  error?: string
  waiting?: boolean
  selfId?: string
  canManage?: boolean
  peers?: PeerInfo[]
  chat?: ChatMessage[]
  breakouts?: BreakoutState | null
  lobby?: LobbyGuest[]
}
type Ack = { ok: boolean; error?: string; poll?: MeetingPoll }

export type CallStatus = 'idle' | 'preview' | 'joining' | 'waiting' | 'joined' | 'reconnecting' | 'left'

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
export const REACTIONS = ['👍', '👏', '😂', '🎉', '❤️', '😮', '🙏', '🤔']
const BLUR_KEY = 'vector.meetings.blur'
const SPEAKING_LEVEL = 0.035

export const mediaSupported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
export const canShareScreen = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia)
export { blurSupported }

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

/** Less video per connection as the call grows, so everyone's upload keeps up (each person sends to everyone). */
function videoBudget(peerCount: number, screen: boolean) {
  if (screen) return { maxBitrate: 1_500_000, scaleResolutionDownBy: 1 }
  if (peerCount <= 2) return { maxBitrate: 1_200_000, scaleResolutionDownBy: 1 }
  if (peerCount <= 4) return { maxBitrate: 700_000, scaleResolutionDownBy: 1.5 }
  return { maxBitrate: 400_000, scaleResolutionDownBy: 2 }
}

/**
 * The call this browser is in. It lives for the whole app (not one page), so people can keep talking while they
 * open the board or other pages; a small call window follows them around.
 *
 * Each person in the call gets a direct connection to every other person in the same room (through a TURN relay when
 * their network blocks direct ones); the server only passes connection details along.
 */
function createCall() {
  const meetingId = ref<string | null>(null)
  const title = ref('')
  const isGuest = ref(false)
  /** This person as others in the call see them. */
  const selfUser = ref<CallUser | null>(null)
  const canManage = ref(false)
  const localStream = shallowRef<MediaStream | null>(null)
  const localRevision = ref(0)
  const screenStream = shallowRef<MediaStream | null>(null)
  const blurStream = shallowRef<MediaStream | null>(null)
  const blurOn = ref(blurSupported && localStorage.getItem(BLUR_KEY) === '1')
  const blurBusy = ref(false)
  const media = reactive<MediaState>({ audio: false, video: false, screen: false })
  const peers = ref<CallPeer[]>([])
  const status = ref<CallStatus>('idle')
  const deviceNote = ref<string | null>(null)
  const callError = ref<string | null>(null)
  /** Why the server sent everyone out ('ended', 'cancelled'), shown once by the call page. */
  const closedReason = ref<string | null>(null)
  const selfId = ref<string | null>(null)
  const hand = ref<number | null>(null)
  const speaking = ref<string[]>([])
  const activeSpeaker = ref<string | null>(null)
  const reactions = ref<FloatingReaction[]>([])
  const chat = ref<ChatMessage[]>([])
  const unreadChat = ref(0)
  const chatVisible = ref(false)
  const lobby = ref<LobbyGuest[]>([])
  const room = ref<string | null>(null)
  const roomName = ref<string | null>(null)
  const breakouts = ref<BreakoutState | null>(null)
  const polls = ref<MeetingPoll[]>([])
  const boardOpen = ref(false)
  const boardRevision = ref(0)
  const boardStrokes = new Map<string, WhiteboardStroke>()
  const boardListeners = new Set<(event: BoardEvent) => void>()

  const inCall = computed(() => status.value === 'joined' || status.value === 'reconnecting')
  /** What this person's own tile shows: the shared screen, the blurred camera, or the camera. */
  const selfStream = computed(() => (media.screen ? screenStream.value : (blurStream.value ?? localStream.value)))

  const connections = new Map<string, Connection>()
  /** Media that arrives before the person is listed waits here until their tile exists. */
  const streams = new Map<string, MediaStream>()
  let boundSocket: Socket | null = null
  let socketWatch: ReturnType<typeof setInterval> | null = null
  let rtcConfig: RTCConfiguration = { iceServers: FALLBACK_ICE }
  let fixedIce: RTCIceServer[] | null = null
  let blurred: BlurredCamera | null = null
  let reactionKey = 0

  const audioTrack = () => localStream.value?.getAudioTracks()[0] ?? null
  const cameraTrack = () => localStream.value?.getVideoTracks()[0] ?? null
  const outgoingVideo = () => screenStream.value?.getVideoTracks()[0] ?? blurred?.track ?? cameraTrack()
  const touchLocal = () => {
    localRevision.value += 1
    triggerRef(localStream)
  }

  // --- Camera, microphone, blur ---------------------------------------------------------------------------------

  function stopBlur() {
    blurred?.stop()
    blurred = null
    blurStream.value = null
  }

  /** Puts the blurred copy of the camera in place (or removes it), following the person's choice. */
  async function applyBlur() {
    stopBlur()
    const camera = cameraTrack()
    if (!blurOn.value || !camera) return touchLocal()
    blurBusy.value = true
    try {
      blurred = await blurBackground(camera)
      blurStream.value = new MediaStream([blurred.track])
    } catch {
      blurOn.value = false
      localStorage.removeItem(BLUR_KEY)
      throw new Error('Background blur could not start on this device.')
    } finally {
      blurBusy.value = false
      touchLocal()
    }
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
    if (status.value === 'idle' || status.value === 'left') status.value = 'preview'
    await applyBlur().catch((error: Error) => (deviceNote.value = error.message))
  }

  /** Releases the camera and microphone of a preview nobody joined from. */
  function stopPreview() {
    if (inCall.value || status.value === 'joining' || status.value === 'waiting') return
    stopBlur()
    localStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value = null
    media.audio = false
    media.video = false
    deviceNote.value = null
    status.value = 'idle'
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

  // --- Connections ------------------------------------------------------------------------------------------------

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

  async function tuneSenders() {
    const budget = videoBudget(connections.size, media.screen)
    for (const connection of connections.values()) {
      const sender = connection.senders.video
      if (!sender) continue
      try {
        const parameters = sender.getParameters()
        if (!parameters.encodings?.length) continue
        parameters.encodings[0] = { ...parameters.encodings[0], ...budget }
        await sender.setParameters(parameters)
      } catch {
        // Some browsers refuse before the connection is set up; the next change retries.
      }
    }
  }

  /** Sends the current microphone and camera/screen to everyone (after a device or screen change). */
  async function refreshOutgoing() {
    for (const connection of connections.values()) {
      await attach(connection, 'audio', audioTrack())
      await attach(connection, 'video', outgoingVideo())
    }
    void tuneSenders()
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
    // Without it nothing is negotiated while nobody has a camera or microphone, and the tile waits forever.
    pc.createDataChannel('vector', { negotiated: true, id: 0 })
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
      if (pc.connectionState === 'connected') void tuneSenders()
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
    void tuneSenders()
  }

  const listed = (peer: PeerInfo): CallPeer => ({
    ...peer,
    stream: streams.get(peer.socketId) ?? null,
    revision: 0,
    connection: connections.get(peer.socketId)?.pc.connectionState ?? 'new',
  })

  /** The people in this room now: connections to people still here stay, new people are connected to. */
  function reconcile(list: PeerInfo[]) {
    const keep = new Set(list.map((peer) => peer.socketId))
    for (const socketId of [...connections.keys()]) if (!keep.has(socketId)) dropPeer(socketId)
    const current = new Map(peers.value.map((peer) => [peer.socketId, peer]))
    peers.value = list.map((peer) => {
      const known = current.get(peer.socketId)
      return known ? { ...known, ...peer } : listed(peer)
    })
    list.forEach((peer) => connect(peer.socketId))
    void tuneSenders()
  }

  // --- Speaking -----------------------------------------------------------------------------------------------------

  let audioContext: AudioContext | null = null
  const meters = new Map<string, { trackId: string; source: MediaStreamAudioSourceNode; analyser: AnalyserNode; buffer: Uint8Array<ArrayBuffer> }>()
  let meterTimer: ReturnType<typeof setInterval> | null = null

  function level(entry: { analyser: AnalyserNode; buffer: Uint8Array<ArrayBuffer> }) {
    entry.analyser.getByteTimeDomainData(entry.buffer)
    let sum = 0
    for (const value of entry.buffer) sum += ((value - 128) / 128) ** 2
    return Math.sqrt(sum / entry.buffer.length)
  }

  /** Who is talking (for the green ring and for the small call window, which shows whoever spoke last). */
  function measure() {
    if (!audioContext) return
    const sources = new Map<string, MediaStreamTrack | null>([['self', media.audio ? audioTrack() : null]])
    for (const peer of peers.value) sources.set(peer.socketId, peer.media.audio ? (peer.stream?.getAudioTracks()[0] ?? null) : null)
    for (const [key, entry] of meters) {
      if (sources.get(key)?.id !== entry.trackId) {
        entry.source.disconnect()
        meters.delete(key)
      }
    }
    const loud: string[] = []
    let loudest: { key: string; value: number } | null = null
    for (const [key, track] of sources) {
      if (!track || track.readyState !== 'live') continue
      let entry = meters.get(key)
      if (!entry) {
        const source = audioContext.createMediaStreamSource(new MediaStream([track]))
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)
        entry = { trackId: track.id, source, analyser, buffer: new Uint8Array(analyser.fftSize) }
        meters.set(key, entry)
      }
      const value = level(entry)
      if (value > SPEAKING_LEVEL) {
        loud.push(key)
        if (key !== 'self' && (!loudest || value > loudest.value)) loudest = { key, value }
      }
    }
    if (loud.join() !== speaking.value.join()) speaking.value = loud
    if (loudest) activeSpeaker.value = loudest.key
    else if (activeSpeaker.value && !peers.value.some((peer) => peer.socketId === activeSpeaker.value)) activeSpeaker.value = null
  }

  function startMeters() {
    try {
      audioContext ??= new AudioContext()
      void audioContext.resume()
    } catch {
      audioContext = null
      return
    }
    meterTimer ??= setInterval(measure, 200)
  }

  function stopMeters() {
    if (meterTimer) clearInterval(meterTimer)
    meterTimer = null
    for (const entry of meters.values()) entry.source.disconnect()
    meters.clear()
    void audioContext?.close().catch(() => undefined)
    audioContext = null
    speaking.value = []
    activeSpeaker.value = null
  }

  // --- Keeping the screen awake -------------------------------------------------------------------------------------

  let wakeLock: WakeLockSentinel | null = null
  async function holdScreen() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible' || wakeLock) return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => (wakeLock = null))
    } catch {
      wakeLock = null
    }
  }
  function releaseScreen() {
    void wakeLock?.release().catch(() => undefined)
    wakeLock = null
  }
  // Phones drop the lock whenever the page is hidden; take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (inCall.value && document.visibilityState === 'visible') void holdScreen()
  })

  // --- Server events ------------------------------------------------------------------------------------------------

  function emit<T = Ack>(event: string, payload: unknown = {}) {
    return new Promise<T>((resolve) => {
      if (!boundSocket?.connected) return resolve({ ok: false, error: 'Not connected. Check your connection.' } as T)
      boundSocket.timeout(10_000).emit(event, payload, (error: Error | null, response: T) =>
        resolve(error ? ({ ok: false, error: 'No answer from Vector. Check your connection.' } as T) : response),
      )
    })
  }
  async function act(event: string, payload: unknown = {}) {
    const result = await emit(event, payload)
    if (!result.ok) throw new Error(result.error ?? 'That did not work. Try again.')
    return result
  }

  function addReaction(socketId: string, emoji: string) {
    const key = (reactionKey += 1)
    reactions.value = [...reactions.value, { key, tileId: socketId === selfId.value ? 'self' : socketId, emoji }]
    setTimeout(() => (reactions.value = reactions.value.filter((item) => item.key !== key)), 4000)
  }

  function addChat(message: ChatMessage) {
    if (chat.value.some((item) => item.id === message.id)) return
    chat.value = [...chat.value, message]
    if (!chatVisible.value && message.author.id !== selfUser.value?.id) unreadChat.value += 1
  }

  function upsertPoll(poll: MeetingPoll) {
    const known = polls.value.find((item) => item.id === poll.id)
    const next = { ...poll, myVote: poll.myVote ?? known?.myVote ?? null }
    polls.value = known ? polls.value.map((item) => (item.id === poll.id ? next : item)) : [...polls.value, next]
  }

  const boardEvent = (event: BoardEvent) => {
    boardRevision.value += 1
    for (const listener of boardListeners) listener(event)
  }
  function addStrokePart(part: WhiteboardStroke) {
    let stroke = boardStrokes.get(part.id)
    if (stroke) stroke.points.push(...part.points)
    else {
      stroke = { ...part, points: [...part.points] }
      boardStrokes.set(part.id, stroke)
    }
    boardEvent({ type: 'stroke', stroke, points: part.points })
  }

  async function loadShared() {
    const result = await emit<{ ok: boolean; polls?: MeetingPoll[]; board?: { open: boolean; strokes: WhiteboardStroke[] } }>('meeting:collab')
    if (!result.ok) return
    polls.value = result.polls ?? []
    boardStrokes.clear()
    for (const stroke of result.board?.strokes ?? []) boardStrokes.set(stroke.id, stroke)
    boardOpen.value = Boolean(result.board?.open)
    boardEvent({ type: 'reset' })
  }

  const onPeerJoined = (peer: PeerInfo) => {
    if (peers.value.some((item) => item.socketId === peer.socketId)) return
    peers.value = [...peers.value, listed(peer)]
    connect(peer.socketId)
  }
  const onPeerLeft = ({ socketId }: { socketId: string }) => dropPeer(socketId)
  const onPeerMedia = ({ socketId, media: next }: { socketId: string; media: MediaState }) => updatePeer(socketId, { media: next })
  const onPeerHand = ({ socketId, hand: raised }: { socketId: string; hand: number | null }) => {
    if (socketId === selfId.value) hand.value = raised
    else updatePeer(socketId, { hand: raised })
  }
  const onMoved = (payload: { room: string | null; roomName: string | null; peers: PeerInfo[]; chat: ChatMessage[] }) => {
    const changedRoom = payload.room !== room.value
    room.value = payload.room
    roomName.value = payload.roomName
    reconcile(payload.peers)
    if (changedRoom) {
      chat.value = payload.chat
      unreadChat.value = 0
    }
  }
  const onClosed = ({ meetingId: id, reason }: { meetingId: string; reason: string }) => {
    if (id !== meetingId.value) return
    closedReason.value = reason
    leave()
  }
  const onChanged = ({ id, status: next }: { id: string; status: string }) => {
    if (id === meetingId.value && inCall.value && (next === 'ended' || next === 'cancelled')) onClosed({ meetingId: id, reason: next })
  }
  const onAdmitted = () => void enter()
  const onDenied = ({ reason }: { reason?: string }) => {
    callError.value = reason === 'guests-off' ? 'The host turned off guest access.' : 'Nobody let you in this time. You can ask again.'
    stopWatching()
    bind(null)
    status.value = 'preview'
  }
  const onSocketDown = () => {
    if (status.value === 'joined') status.value = 'reconnecting'
  }
  const onSocketUp = () => {
    if (status.value === 'reconnecting' || status.value === 'joined' || status.value === 'waiting') void rejoin()
  }

  const HANDLERS = {
    'meeting:signal': onSignal,
    'meeting:peer-joined': onPeerJoined,
    'meeting:peer-left': onPeerLeft,
    'meeting:peer-media': onPeerMedia,
    'meeting:peer-hand': onPeerHand,
    'meeting:reaction': ({ socketId, emoji }: { socketId: string; emoji: string }) => addReaction(socketId, emoji),
    'meeting:chat': addChat,
    'meeting:lobby': (list: LobbyGuest[]) => (lobby.value = list),
    'meeting:admitted': onAdmitted,
    'meeting:denied': onDenied,
    'meeting:moved': onMoved,
    'meeting:breakouts': (state: BreakoutState | null) => (breakouts.value = state),
    'meeting:poll': upsertPoll,
    'meeting:wb:stroke': addStrokePart,
    'meeting:wb:remove': ({ id }: { id: string }) => boardStrokes.delete(id) && boardEvent({ type: 'remove', id }),
    'meeting:wb:clear': () => {
      boardStrokes.clear()
      boardEvent({ type: 'reset' })
    },
    'meeting:wb:open': ({ open }: { open: boolean }) => (boardOpen.value = open),
    'meeting:closed': onClosed,
    'meeting:changed': onChanged,
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
      socket.timeout(10_000).emit('meeting:join', { meetingId: meetingId.value, media: { ...media } }, (error: Error | null, response: JoinResult) =>
        resolve(error ? { ok: false, error: 'The meeting did not answer. Check your connection and try again.' } : response),
      ),
    )
  }

  function closeConnections() {
    for (const socketId of [...connections.keys()]) dropPeer(socketId)
    peers.value = []
  }

  /** In the call (or let in from the lobby): connect to everyone in the main room, load chat, polls and whiteboard. */
  async function enter(initial = false) {
    const socket = boundSocket
    if (!socket) return
    closeConnections()
    selfId.value = socket.id ?? null
    const result = await enterRoom(socket)
    if (result.waiting) {
      status.value = 'waiting'
      return
    }
    if (!result.ok && initial) {
      // A first attempt that fails (call full, meeting over…) keeps the preview, so the person can try again.
      bind(null)
      status.value = 'preview'
      throw new Error(result.error ?? 'Could not join the meeting')
    }
    if (!result.ok) {
      callError.value = result.error ?? 'You were disconnected from the call.'
      leave()
      return
    }
    selfId.value = result.selfId ?? selfId.value
    canManage.value = Boolean(result.canManage)
    room.value = null
    roomName.value = null
    chat.value = result.chat ?? []
    breakouts.value = result.breakouts ?? null
    lobby.value = result.lobby ?? []
    reconcile(result.peers ?? [])
    status.value = 'joined'
    if (media.audio || media.video) shareMedia()
    if (hand.value) boundSocket?.emit('meeting:hand', { raised: true })
    startMeters()
    void holdScreen()
    void loadShared()
  }

  /** After the connection to Vector drops and comes back: the server forgot this call, so join it again. */
  async function rejoin() {
    const socket = getSocket()
    if (!socket || !meetingId.value) return
    if (socket !== boundSocket) bind(socket)
    if (!socket.connected) {
      if (status.value === 'joined') status.value = 'reconnecting'
      return
    }
    await enter()
  }

  /**
   * Joins the call: everyone already in it is connected to, and they connect back. Guests (`options.guest`) wait in
   * the lobby until someone lets them in; their network servers come with their guest pass.
   */
  async function join(id: string, options: { user: CallUser | null; title?: string; guest?: boolean; iceServers?: RTCIceServer[] }) {
    const socket = getSocket()
    if (!socket?.connected) throw new Error('Not connected to Vector. Check your internet connection and try again.')
    if (inCall.value && meetingId.value !== id) leave()
    if (!localStream.value) await startPreview()
    meetingId.value = id
    title.value = options.title ?? ''
    isGuest.value = Boolean(options.guest)
    fixedIce = options.iceServers ?? null
    selfUser.value = options.user
    callError.value = null
    closedReason.value = null
    status.value = 'joining'
    rtcConfig = { iceServers: fixedIce?.length ? fixedIce : await iceServers() }
    bind(socket)
    await enter(true)
    socketWatch ??= setInterval(() => {
      // The app may replace its connection (e.g. after signing in again); follow it so the call survives.
      const current = getSocket()
      if (current && current !== boundSocket) void rejoin()
    }, 3000)
    setMediaSession()
  }

  function stopWatching() {
    if (socketWatch) clearInterval(socketWatch)
    socketWatch = null
  }

  /** Leaves the call (or the lobby) and releases the camera and microphone. */
  function leave() {
    if (meetingId.value) boundSocket?.emit('meeting:leave')
    stopWatching()
    bind(null)
    closeConnections()
    stopMeters()
    releaseScreen()
    stopBlur()
    screenStream.value?.getTracks().forEach((track) => track.stop())
    localStream.value?.getTracks().forEach((track) => track.stop())
    screenStream.value = null
    localStream.value = null
    media.audio = false
    media.video = false
    media.screen = false
    hand.value = null
    reactions.value = []
    chat.value = []
    unreadChat.value = 0
    lobby.value = []
    room.value = null
    roomName.value = null
    breakouts.value = null
    polls.value = []
    boardOpen.value = false
    boardStrokes.clear()
    boardEvent({ type: 'reset' })
    status.value = meetingId.value ? 'left' : 'idle'
    clearMediaSession()
  }

  /** Forgets which meeting this was, e.g. when the page for it closes after leaving. */
  function reset() {
    if (inCall.value || status.value === 'waiting') return
    meetingId.value = null
    title.value = ''
    isGuest.value = false
    canManage.value = false
    if (status.value === 'left') status.value = 'idle'
  }

  // --- Controls -------------------------------------------------------------------------------------------------

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
      stopBlur()
      if (track) {
        track.stop()
        localStream.value!.removeTrack(track)
        touchLocal()
      }
    } else {
      await requestTrack('video')
      media.video = true
      deviceNote.value = audioTrack() ? null : deviceNote.value
      await applyBlur().catch((error: Error) => (deviceNote.value = error.message))
    }
    await refreshOutgoing()
    shareMedia()
  }

  async function toggleBlur() {
    if (!blurSupported) throw new Error('This browser cannot blur the background.')
    blurOn.value = !blurOn.value
    if (blurOn.value) localStorage.setItem(BLUR_KEY, '1')
    else localStorage.removeItem(BLUR_KEY)
    await applyBlur()
    await refreshOutgoing()
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

  function toggleHand() {
    const raised = !hand.value
    hand.value = raised ? Date.now() : null
    boundSocket?.emit('meeting:hand', { raised })
  }
  const lowerHand = (socketId: string) => boundSocket?.emit('meeting:hand', { socketId, raised: false })
  const sendReaction = (emoji: string) => boundSocket?.emit('meeting:reaction', { emoji })
  const sendChat = (body: string) => act('meeting:chat', { body })
  const admit = (socketId: string, allow: boolean) => boundSocket?.emit('meeting:admit', { socketId, allow })

  const openBreakouts = (rooms: Array<{ name: string; socketIds: string[] }>) => act('meeting:breakouts:open', { rooms })
  const moveToRoom = (socketId: string | null, roomId: string | null) => act('meeting:breakouts:move', { socketId, room: roomId })
  const closeBreakouts = () => act('meeting:breakouts:close')
  const broadcastToRooms = (body: string) => act('meeting:breakouts:broadcast', { body })

  async function createPoll(question: string, options: string[]) {
    const result = await act('meeting:poll:create', { question, options })
    if (result.poll) upsertPoll(result.poll)
  }
  async function vote(pollId: string, option: number) {
    const result = await act('meeting:poll:vote', { pollId, option })
    if (result.poll) upsertPoll(result.poll)
  }
  const closePoll = (pollId: string) => act('meeting:poll:close', { pollId })

  /** Adds points to a stroke being drawn here; others see it appear as it is drawn. */
  function drawStroke(part: Omit<WhiteboardStroke, 'owner'>) {
    if (!part.points.length) return
    addStrokePart({ ...part, owner: selfUser.value?.id ?? 'self' })
    boundSocket?.emit('meeting:wb:stroke', part)
  }
  function removeStroke(id: string) {
    if (boardStrokes.delete(id)) boardEvent({ type: 'remove', id })
    boundSocket?.emit('meeting:wb:remove', { id })
  }
  const clearBoard = () => boundSocket?.emit('meeting:wb:clear')
  function setBoardOpen(open: boolean) {
    boardOpen.value = open
    boundSocket?.emit('meeting:wb:open', { open })
  }
  function onBoard(listener: (event: BoardEvent) => void) {
    boardListeners.add(listener)
    return () => boardListeners.delete(listener)
  }

  // --- Media keys and the system's call controls (e.g. in picture-in-picture) --------------------------------------

  function setMediaSession() {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession as MediaSession & { setMicrophoneActive?: (active: boolean) => void; setCameraActive?: (active: boolean) => void }
    try {
      session.metadata = new MediaMetadata({ title: title.value || 'Meeting', artist: 'Vector' })
    } catch {
      // Not every browser has MediaMetadata.
    }
    const handlers: Record<string, () => void> = {
      togglemicrophone: () => void toggleAudio().catch(() => undefined),
      togglecamera: () => void toggleVideo().catch(() => undefined),
      hangup: () => leave(),
    }
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        session.setActionHandler(action as MediaSessionAction, handler)
      } catch {
        // Older browsers do not know call actions.
      }
    }
  }
  function clearMediaSession() {
    if (!('mediaSession' in navigator)) return
    for (const action of ['togglemicrophone', 'togglecamera', 'hangup']) {
      try {
        navigator.mediaSession.setActionHandler(action as MediaSessionAction, null)
      } catch {
        // Nothing to clear.
      }
    }
  }

  return {
    meetingId,
    title,
    isGuest,
    selfUser,
    canManage,
    localStream,
    localRevision,
    screenStream,
    selfStream,
    media,
    peers,
    status,
    inCall,
    deviceNote,
    callError,
    closedReason,
    selfId,
    hand,
    speaking,
    activeSpeaker,
    reactions,
    chat,
    unreadChat,
    chatVisible,
    lobby,
    room,
    roomName,
    breakouts,
    polls,
    boardOpen,
    boardRevision,
    boardStrokes,
    blurOn,
    blurBusy,
    startPreview,
    stopPreview,
    join,
    leave,
    reset,
    toggleAudio,
    toggleVideo,
    toggleBlur,
    toggleScreenShare,
    toggleHand,
    lowerHand,
    sendReaction,
    sendChat,
    admit,
    openBreakouts,
    moveToRoom,
    closeBreakouts,
    broadcastToRooms,
    createPoll,
    vote,
    closePoll,
    drawStroke,
    removeStroke,
    clearBoard,
    setBoardOpen,
    onBoard,
  }
}

export type MeetingCall = ReturnType<typeof createCall>

let instance: MeetingCall | null = null

/** The one call of this browser tab, shared by the meeting page, the small call window and picture-in-picture. */
export function useMeetingCall() {
  return (instance ??= createCall())
}
