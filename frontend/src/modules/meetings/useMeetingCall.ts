import type { Socket } from 'socket.io-client'
import { computed, reactive, ref, shallowRef, triggerRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { getSocket, onSocketChange } from '@/lib/realtime'
import type { SocketHandlers } from '@/lib/socket-events'
import type { UserSummary } from '@/types/models'
import { type BlurredCamera, blurBackground, blurSupported } from './call/background-blur'
import { type BackgroundChoice, effectFor, saveChoice, savedChoice } from './call/backgrounds'
import { captionsSupported, createCaptioner } from './call/captions'
import { type CleanMicrophone, noiseSupported, suppressNoise } from './call/noise'
import { type SpeechPiece, type SpeechRecorder, aiNotesSupported, recordSpeech } from './call/transcriber'
import { type DeviceKind, type DeviceLists, canChooseSpeaker, listDevices, saveDevice, savedDevice, withDevice } from './call/devices'
import { type CallRecorder, recordingSupported, startRecorder } from './call/recorder'
import { type CallShortcutAction, callShortcutFor, isTalkKey } from './call/shortcuts'
import { type CallQuality, createSfuTransport } from './call/sfu'
import { type StatsSample, measure as measureConnection, worstQuality } from './call/stats'
import { type MeetingFile, type MeetingLobby, type MeetingPoll, type MeetingQuestion, type WhiteboardStroke, meetingsApi } from './meetings.api'

export type { BackgroundChoice, CallQuality }
export { aiNotesSupported, canChooseSpeaker, captionsSupported, noiseSupported, recordingSupported }

/** How captions are made: by the server's AI from short recordings, or by each browser's own speech recognition. */
export type Transcribing = { by: string; since: string; mode?: 'ai' | 'browser' }

/** One question to the in-call assistant (or a "catch me up") and its answer. */
export interface AssistantTurn {
  id: number
  question: string | null
  answer: string | null
  error: string | null
  at: number
}

const NOISE_KEY = 'vector.meetings.noise'
const CAPTION_LANGUAGE_KEY = 'vector.meetings.caption-language'

export interface MediaState {
  audio: boolean
  video: boolean
  screen: boolean
}

export type PeerConnection = RTCPeerConnectionState

/** People in a call: organization members, or guests who came with the meeting's guest link. */
export type CallUser = UserSummary

/** The meeting's host, an organization admin, a co-host the host chose for this call, or nobody special. */
export type CallRole = 'host' | 'admin' | 'cohost' | null

const ROLE_RANKS: Record<string, number> = { host: 2, admin: 2, cohost: 1 }
export const roleRank = (role: CallRole) => (role ? (ROLE_RANKS[role] ?? 0) : 0)
export const ROLE_LABELS: Record<NonNullable<CallRole>, string> = { host: 'Host', admin: 'Admin', cohost: 'Co-host' }

interface PeerInfo {
  socketId: string
  user: CallUser
  media: MediaState
  /** When the hand went up (people are called on in that order), or null. */
  hand: number | null
  room: string | null
  role: CallRole
  guest: boolean
}

export interface CallPeer extends PeerInfo {
  stream: MediaStream | null
  /** Bumped whenever a track arrives or resumes, so the tile re-attaches its video. */
  revision: number
  connection: PeerConnection
  /** How well the connection with this person carries the call (null: not measured yet). */
  quality: CallQuality | null
  qualityNote: string | null
}

/** What people who do not run the call may do. */
export interface CallPermissions {
  chat: boolean
  share: boolean
  unmute: boolean
}

export interface Caption {
  id: string
  socketId: string
  speaker: { id: string; name: string; guest: boolean }
  text: string
  /** In the language this person reads captions in (when they chose one). */
  translated?: string
  final: boolean
  at: number
}

export interface CallChatMessage {
  id: string
  at: string
  author: CallUser
  body: string
  room: string | null
  /** Sent by the host to every breakout room. */
  broadcast: boolean
  attachment: MeetingFile | null
}

/** Someone waiting to be let in: a guest from the link, or (with the lobby for everyone) an invited member. */
export interface LobbyGuest {
  socketId: string
  user: CallUser
  since: string
  guest: boolean
}

export interface BreakoutState {
  rooms: Array<{ id: string; name: string; people: Array<{ socketId: string; user: CallUser }> }>
  main: Array<{ socketId: string; user: CallUser }>
  /** When the rooms close by themselves (null: when the host closes them). */
  endsAt: string | null
}

/** Someone who joined by phone (through the media server; identities start with `sip_`). */
export interface PhoneCaller {
  identity: string
  name: string
  stream: MediaStream | null
  revision: number
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
  /** An answer is being applied: an offer arriving now follows it and is not a collision. */
  settingAnswer: boolean
  /** One sender per kind, reused when the camera or screen changes so no new negotiation is needed. */
  senders: { audio?: RTCRtpSender; video?: RTCRtpSender }
  /** Sending media; the polite side waits for the first offer before it starts. */
  started: boolean
  startTimer?: ReturnType<typeof setTimeout>
  restartTimer?: ReturnType<typeof setTimeout>
}

type Signal = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }
type JoinResult = {
  ok: boolean
  error?: string
  waiting?: boolean
  selfId?: string
  canManage?: boolean
  role?: CallRole
  locked?: boolean
  permissions?: CallPermissions
  spotlight?: string | null
  recording?: { by: string; since: string } | null
  transcribing?: Transcribing | null
  /** The AI assistant is available in this call. */
  ai?: boolean
  boardOpen?: boolean
  peers?: PeerInfo[]
  chat?: CallChatMessage[]
  breakouts?: BreakoutState | null
  lobby?: LobbyGuest[]
  media?: MediaRoute
  capacity?: number
  lobbyMode?: MeetingLobby
  /** Waiting with nobody in the call who can let this person in yet. */
  alone?: boolean
}
/** How this browser sends and receives video: directly with each person, or through the media server. */
type MediaRoute = { mode: 'direct' } | { mode: 'sfu'; url: string; token: string }
type Ack = {
  ok: boolean
  error?: string
  poll?: MeetingPoll
  recordingId?: string
  muted?: number
  url?: string
  questions?: MeetingQuestion[]
  question?: MeetingQuestion
  similar?: MeetingQuestion
  merged?: number
  draft?: string
  answer?: string
}

export type CallStatus = 'idle' | 'preview' | 'joining' | 'waiting' | 'joined' | 'reconnecting' | 'left'

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
const VIDEO: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } }
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]
export const REACTIONS = ['👍', '👏', '😂', '🎉', '❤️', '😮', '🙏', '🤔']
const CAPTIONS_KEY = 'vector.meetings.captions'
const SPEAKING_LEVEL = 0.035
const STATS_EVERY_MS = 3000
const CAPTION_LINGER_MS = 6000
const DEFAULT_PERMISSIONS: CallPermissions = { chat: true, share: true, unmute: true }
const PHONE_PREFIX = 'sip_'
/** Numbers per whiteboard message (the server's limit). */
const BOARD_PART = 400

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
 * Without a media server, each person in the call gets a direct connection to every other person in the same room
 * (through a TURN relay when their network blocks direct ones); the server only passes connection details along.
 * With one (LiveKit), everyone sends their media once to it and receives the others' from it (see call/sfu.ts).
 */
function createCall() {
  const meetingId = ref<string | null>(null)
  const title = ref('')
  const isGuest = ref(false)
  /** This person as others in the call see them. */
  const selfUser = ref<CallUser | null>(null)
  const canManage = ref(false)
  const role = ref<CallRole>(null)
  /** Nobody new may join until someone running the call opens it again. */
  const locked = ref(false)
  const localStream = shallowRef<MediaStream | null>(null)
  const localRevision = ref(0)
  const screenStream = shallowRef<MediaStream | null>(null)
  const blurStream = shallowRef<MediaStream | null>(null)
  /** What is behind this person on camera: nothing, blur, a built-in scene or their own picture. */
  const background = ref<BackgroundChoice>(blurSupported ? savedChoice() : { kind: 'none' })
  const blurOn = computed(() => background.value.kind !== 'none')
  const blurBusy = ref(false)
  /** AI noise suppression on this person's microphone. */
  const noiseOn = ref(noiseSupported && localStorage.getItem(NOISE_KEY) !== '0')
  const noiseBusy = ref(false)
  /** The AI assistant is available in this call (server key and the organization's plan). */
  const aiAvailable = ref(false)
  /** The language this person reads captions in (null: as spoken). */
  const captionLanguage = ref<string | null>(localStorage.getItem(CAPTION_LANGUAGE_KEY) || null)
  const assistantTurns = ref<AssistantTurn[]>([])
  const assistantBusy = ref(false)
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
  const chat = ref<CallChatMessage[]>([])
  const unreadChat = ref(0)
  const chatVisible = ref(false)
  const lobby = ref<LobbyGuest[]>([])
  const room = ref<string | null>(null)
  const roomName = ref<string | null>(null)
  const breakouts = ref<BreakoutState | null>(null)
  /** Who waits in the lobby in this meeting, and whether nobody who can let this person in is in the call yet. */
  const lobbyMode = ref<MeetingLobby>('guests')
  const waitingAlone = ref(false)
  const questions = ref<MeetingQuestion[]>([])
  const phoneCallers = ref<PhoneCaller[]>([])
  /** A side panel tab to show (set by keyboard shortcuts; the call view opens it). */
  const panelRequest = ref<{ tab: string; at: number } | null>(null)
  const polls = ref<MeetingPoll[]>([])
  const boardOpen = ref(false)
  const boardRevision = ref(0)
  const boardStrokes = new Map<string, WhiteboardStroke>()
  const boardListeners = new Set<(event: BoardEvent) => void>()
  const permissions = ref<CallPermissions>({ ...DEFAULT_PERMISSIONS })
  /** The person everyone sees large, chosen by the host (a socket id), or null. */
  const spotlight = ref<string | null>(null)
  /** Someone is recording the call (everyone is shown this). */
  const recording = ref<{ by: string; since: string } | null>(null)
  /** This browser is the one recording, and how far the upload got afterwards. */
  const recordingHere = ref(false)
  const uploadProgress = ref<number | null>(null)
  const transcribing = ref<Transcribing | null>(null)
  const captions = ref<Caption[]>([])
  const showCaptions = ref(localStorage.getItem(CAPTIONS_KEY) !== '0')
  const quality = ref<CallQuality | null>(null)
  const mediaMode = ref<'direct' | 'sfu'>('direct')
  const capacity = ref<number | null>(null)
  const devices = ref<DeviceLists>({ audioinput: [], videoinput: [], audiooutput: [] })
  const chosenDevices = reactive<Record<DeviceKind, string | null>>({
    audioinput: savedDevice('audioinput'),
    videoinput: savedDevice('videoinput'),
    audiooutput: savedDevice('audiooutput'),
  })

  const inCall = computed(() => status.value === 'joined' || status.value === 'reconnecting')
  /** What this person's own tile shows: the shared screen, the blurred camera, or the camera. */
  const selfStream = computed(() => (media.screen ? screenStream.value : (blurStream.value ?? localStream.value)))

  const connections = new Map<string, Connection>()
  /** Media that arrives before the person is listed waits here until their tile exists. */
  const streams = new Map<string, MediaStream>()
  let boundSocket: Socket | null = null
  /** Stops following the app's connection (set while in a call). */
  let socketWatch: (() => void) | null = null
  let rtcConfig: RTCConfiguration = { iceServers: FALLBACK_ICE }
  let fixedIce: RTCIceServer[] | null = null
  let blurred: BlurredCamera | null = null
  let reactionKey = 0
  let route: MediaRoute = { mode: 'direct' }
  /** People whose media connection to the media server is up (by socket id). */
  const sfuPresent = new Set<string>()
  let recorder: CallRecorder | null = null
  let recordingId: string | null = null

  let denoised: CleanMicrophone | null = null
  /** Bumped when the microphone others hear changes (noise suppression on or off, another device). */
  const audioRevision = ref(0)

  const audioTrack = () => localStream.value?.getAudioTracks()[0] ?? null
  /** What others hear: the microphone with background noise removed, when that is on. */
  const outgoingAudio = () => (denoised && audioTrack() ? denoised.track : audioTrack())
  const cameraTrack = () => localStream.value?.getVideoTracks()[0] ?? null
  const outgoingVideo = () => screenStream.value?.getVideoTracks()[0] ?? blurred?.track ?? cameraTrack()
  const touchLocal = () => {
    localRevision.value += 1
    triggerRef(localStream)
  }

  // --- Camera, microphone, background effects, noise suppression -----------------------------------------------------

  function stopBlur() {
    blurred?.stop()
    blurred = null
    blurStream.value = null
  }

  /** Puts the camera with the chosen background in place (or the plain camera), following the person's choice. */
  async function applyBlur() {
    stopBlur()
    const camera = cameraTrack()
    if (background.value.kind === 'none' || !camera) return touchLocal()
    blurBusy.value = true
    try {
      const effect = await effectFor(background.value)
      if (effect) {
        blurred = await blurBackground(camera, effect)
        blurStream.value = new MediaStream([blurred.track])
      }
    } catch {
      background.value = { kind: 'none' }
      saveChoice(background.value)
      throw new Error('Background effects could not start on this device.')
    } finally {
      blurBusy.value = false
      touchLocal()
    }
  }

  function stopNoise() {
    denoised?.stop()
    denoised = null
  }

  /** Puts the noise-free copy of the microphone in place (or the plain microphone), following the person's choice. */
  async function applyNoise() {
    stopNoise()
    const microphone = audioTrack()
    if (noiseOn.value && microphone && noiseSupported) {
      noiseBusy.value = true
      try {
        denoised = await suppressNoise(microphone)
      } catch {
        noiseOn.value = false
        localStorage.setItem(NOISE_KEY, '0')
        deviceNote.value = 'Noise suppression could not start on this device; your microphone is used as it is.'
      } finally {
        noiseBusy.value = false
      }
    }
    audioRevision.value += 1
  }

  const audioConstraints = () => withDevice(AUDIO, chosenDevices.audioinput)
  const videoConstraints = () => withDevice(VIDEO, chosenDevices.videoinput)

  async function refreshDevices() {
    devices.value = await listDevices()
    // A chosen device that is gone (unplugged headset) falls back to the system default.
    for (const kind of ['audioinput', 'videoinput', 'audiooutput'] as DeviceKind[]) {
      const id = chosenDevices[kind]
      if (id && devices.value[kind].length && !devices.value[kind].some((device) => device.id === id)) chosenDevices[kind] = null
    }
  }

  /** Gets a track from the chosen device, or from the default one when that device cannot be used. */
  async function openTrack(kind: 'audio' | 'video') {
    const chosen = kind === 'audio' ? chosenDevices.audioinput : chosenDevices.videoinput
    const base = kind === 'audio' ? AUDIO : VIDEO
    try {
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: audioConstraints() } : { video: videoConstraints() })
      return stream.getTracks()[0]!
    } catch (error) {
      if (!chosen) throw error
      const stream = await navigator.mediaDevices.getUserMedia(kind === 'audio' ? { audio: base } : { video: base })
      return stream.getTracks()[0]!
    }
  }

  /**
   * Switches to another microphone, camera or speaker, also in the middle of a call (the others get the new one
   * without reconnecting). `null` is the system default.
   */
  async function chooseDevice(kind: DeviceKind, id: string | null) {
    chosenDevices[kind] = id
    saveDevice(kind, id)
    if (kind === 'audiooutput') return
    const stream = localStream.value
    if (!stream || !mediaSupported) return
    if (kind === 'audioinput' && audioTrack()) {
      const old = audioTrack()!
      const next = await openTrack('audio').catch((error) => {
        throw new Error(deviceProblem(error, 'microphone'))
      })
      next.enabled = media.audio
      stream.removeTrack(old)
      old.stop()
      stream.addTrack(next)
      touchLocal()
      await applyNoise()
    }
    if (kind === 'videoinput' && cameraTrack()) {
      const old = cameraTrack()!
      const next = await openTrack('video').catch((error) => {
        throw new Error(deviceProblem(error, 'camera'))
      })
      stream.removeTrack(old)
      old.stop()
      stream.addTrack(next)
      await applyBlur().catch((error: Error) => (deviceNote.value = error.message))
    }
    await refreshOutgoing()
    void refreshDevices()
  }

  if (typeof navigator !== 'undefined' && navigator.mediaDevices?.addEventListener) {
    navigator.mediaDevices.addEventListener('devicechange', () => {
      void refreshDevices().then(async () => {
        // The microphone or camera in use was unplugged: carry on with the default one.
        const lostAudio = audioTrack()?.readyState === 'ended'
        const lostVideo = cameraTrack()?.readyState === 'ended'
        if (lostAudio) await chooseDevice('audioinput', null).catch(() => undefined)
        if (lostVideo) await chooseDevice('videoinput', null).catch(() => undefined)
        if (lostAudio || lostVideo) toast('A device was disconnected', { description: 'Vector switched to your default microphone and camera.' })
      })
    })
  }

  /** Asks for camera and microphone; falls back to one of them, then to joining without devices. */
  async function startPreview() {
    if (localStream.value) return
    if (!mediaSupported) {
      localStream.value = new MediaStream()
      deviceNote.value = window.isSecureContext
        ? 'This browser cannot make video calls. Use a current version of Chrome, Edge, Firefox or Safari.'
        : `Browsers only allow the camera and microphone on secure (https://) addresses. Open https://${window.location.host}${window.location.pathname} to be seen and heard. You can still join to watch and listen.`
      status.value = 'preview'
      return
    }
    let firstError: unknown = null
    const chosen = { audio: audioConstraints(), video: videoConstraints() }
    const attempts: MediaStreamConstraints[] = [chosen, ...(chosenDevices.audioinput || chosenDevices.videoinput ? [{ audio: AUDIO, video: VIDEO }] : []), { audio: AUDIO }, { video: VIDEO }]
    for (const constraints of attempts) {
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
    void refreshDevices()
    await Promise.all([applyBlur().catch((error: Error) => (deviceNote.value = error.message)), applyNoise()])
  }

  /** Releases the camera and microphone of a preview nobody joined from. */
  function stopPreview() {
    if (inCall.value || status.value === 'joining' || status.value === 'waiting') return
    stopBlur()
    stopNoise()
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
      const track = await openTrack(kind)
      if (!localStream.value) localStream.value = new MediaStream()
      localStream.value.addTrack(track)
      touchLocal()
      if (kind === 'audio') await applyNoise()
      return track
    } catch (error) {
      throw new Error(deviceProblem(error, kind === 'audio' ? 'microphone' : 'camera'), { cause: error })
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
    if (route.mode === 'sfu') {
      if (!sfu.connected()) return
      try {
        await sfu.sendAudio(outgoingAudio(), media.audio)
        await sfu.sendVideo(media.screen || media.video ? outgoingVideo() : null, media.screen)
      } catch {
        // Not allowed right now (the host limited sharing or unmuting); the server's state already says so.
      }
      return
    }
    for (const connection of connections.values()) {
      if (!connection.started) continue
      await attach(connection, 'audio', outgoingAudio())
      await attach(connection, 'video', outgoingVideo())
    }
    void tuneSenders()
  }

  /** Someone's media arrived: it goes into their stream, and their tile picks it up. */
  function receiveTrack(peerId: string, track: MediaStreamTrack) {
    const stream = streams.get(peerId) ?? new MediaStream()
    for (const old of stream.getTracks()) if (old.kind === track.kind && old !== track) stream.removeTrack(old)
    if (!stream.getTracks().includes(track)) stream.addTrack(track)
    streams.set(peerId, stream)
    const bump = () => updatePeer(peerId, (peer) => ({ stream, revision: peer.revision + 1 }))
    track.onunmute = bump
    bump()
  }

  // Phone callers only exist in the media server's room: they get their own list, not the app's peers.
  const isPhone = (identity: string) => identity.startsWith(PHONE_PREFIX)
  function updatePhone(identity: string, changes: (caller: PhoneCaller) => Partial<PhoneCaller>) {
    phoneCallers.value = phoneCallers.value.map((caller) => (caller.identity === identity ? { ...caller, ...changes(caller) } : caller))
  }
  function phoneTrack(identity: string, track: MediaStreamTrack, gone = false) {
    updatePhone(identity, (caller) => {
      const stream = caller.stream ?? new MediaStream()
      if (gone) stream.removeTrack(track)
      else if (!stream.getTracks().includes(track)) stream.addTrack(track)
      return { stream, revision: caller.revision + 1 }
    })
  }

  const sfu = createSfuTransport({
    onTrack: (identity, track) => (isPhone(identity) ? phoneTrack(identity, track) : receiveTrack(identity, track)),
    onTrackGone: (peerId, track) => {
      if (isPhone(peerId)) return phoneTrack(peerId, track, true)
      const stream = streams.get(peerId)
      if (!stream) return
      stream.removeTrack(track)
      updatePeer(peerId, (peer) => ({ stream, revision: peer.revision + 1 }))
    },
    onPresence: (peerId, present, name) => {
      if (isPhone(peerId)) {
        const known = phoneCallers.value.some((caller) => caller.identity === peerId)
        if (present && !known) phoneCallers.value = [...phoneCallers.value, { identity: peerId, name: name || 'Phone caller', stream: null, revision: 0 }]
        if (!present) phoneCallers.value = phoneCallers.value.filter((caller) => caller.identity !== peerId)
        return
      }
      if (present) sfuPresent.add(peerId)
      else sfuPresent.delete(peerId)
      updatePeer(peerId, { connection: present ? 'connected' : 'connecting' })
    },
    onQuality: (who, value) => {
      if (who === 'self') quality.value = value
      else updatePeer(who, { quality: value, qualityNote: null })
    },
    onForcedOff: (kind) => {
      if (kind === 'audio') forceMute(null)
      else if (media.screen) void stopScreenShare()
    },
    onState: (state) => {
      if (state === 'reconnecting' && status.value === 'joined') status.value = 'reconnecting'
      if (state === 'connected' && status.value === 'reconnecting' && boundSocket?.connected) status.value = 'joined'
      // The media server dropped this browser for good: join the call again for a new pass.
      if (state === 'lost' && inCall.value) void rejoin()
    },
  })

  /** Connects this browser's media the way the server says (direct connections, or the media server). */
  async function useRoute(next: MediaRoute | undefined) {
    route = next ?? { mode: 'direct' }
    mediaMode.value = route.mode
    phoneCallers.value = []
    if (route.mode !== 'sfu') return sfu.disconnect()
    sfuPresent.clear()
    try {
      await sfu.connect(route.url, route.token)
      await refreshOutgoing()
    } catch (error) {
      callError.value = `Could not reach the video server: ${getErrorMessage(error)}`
    }
  }

  function scheduleIceRestart(connection: Connection, delay: number) {
    clearTimeout(connection.restartTimer)
    connection.restartTimer = setTimeout(() => {
      const state = connection.pc.connectionState
      if (state === 'failed' || state === 'disconnected') connection.pc.restartIce()
    }, delay)
  }

  function start(connection: Connection) {
    if (connection.started) return
    connection.started = true
    clearTimeout(connection.startTimer)
    // Without it nothing is negotiated while nobody has a camera or microphone, and the tile waits forever.
    connection.pc.createDataChannel('vector', { negotiated: true, id: 0 })
    void attach(connection, 'audio', outgoingAudio())
    void attach(connection, 'video', outgoingVideo())
  }

  /** A direct connection to this person (with the media server, everyone's media arrives through it instead). */
  function connect(peerId: string) {
    const existing = connections.get(peerId)
    if (existing) return existing
    if (route.mode === 'sfu') return null
    const pc = new RTCPeerConnection(rtcConfig)
    const connection: Connection = { pc, polite: (selfId.value ?? '') < peerId, makingOffer: false, ignoreOffer: false, settingAnswer: false, senders: {}, started: false }
    connections.set(peerId, connection)

    pc.onicecandidate = (event) => event.candidate && send(peerId, { candidate: event.candidate.toJSON() })
    pc.ontrack = (event) => receiveTrack(peerId, event.track)
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
    // Only one side makes the first offer: after both offer at once, Chrome may never gather network candidates on
    // the side that gives way, and the call never connects.
    if (connection.polite) connection.startTimer = setTimeout(() => start(connection), 4000)
    else start(connection)
    return connection
  }

  async function onSignal({ from, data }: { from: string; data: Signal }) {
    const connection = connections.get(from) ?? connect(from)
    if (!connection) return
    const { pc } = connection
    try {
      if (data.description) {
        const ready = !connection.makingOffer && (pc.signalingState === 'stable' || connection.settingAnswer)
        const collision = data.description.type === 'offer' && !ready
        connection.ignoreOffer = !connection.polite && collision
        if (connection.ignoreOffer) return
        connection.settingAnswer = data.description.type === 'answer'
        try {
          await pc.setRemoteDescription(data.description)
        } finally {
          connection.settingAnswer = false
        }
        if (data.description.type === 'offer') {
          start(connection)
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
      clearTimeout(connection.startTimer)
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
    connection: route.mode === 'sfu' ? (sfuPresent.has(peer.socketId) ? 'connected' : 'connecting') : (connections.get(peer.socketId)?.pc.connectionState ?? 'new'),
    quality: null,
    qualityNote: null,
  })

  /** The people in this room now: connections to people still here stay, new people are connected to. */
  function reconcile(list: PeerInfo[]) {
    const keep = new Set(list.map((peer) => peer.socketId))
    for (const socketId of new Set([...connections.keys(), ...streams.keys(), ...peers.value.map((peer) => peer.socketId)])) {
      if (!keep.has(socketId)) dropPeer(socketId)
    }
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

  // --- Connection quality (direct connections; the media server reports its own) ------------------------------------

  const samples = new Map<string, StatsSample>()
  let statsTimer: ReturnType<typeof setInterval> | null = null

  async function measureConnections() {
    if (route.mode === 'sfu') return
    const results: Array<CallQuality | null> = []
    for (const [peerId, connection] of connections) {
      const health = await measureConnection(connection.pc, samples.get(peerId) ?? null)
      if (!health) continue
      samples.set(peerId, health.sample)
      results.push(health.quality)
      const parts = [health.rttMs !== null && `${health.rttMs} ms delay`, health.lossPercent !== null && `${health.lossPercent}% lost`].filter(Boolean)
      updatePeer(peerId, { quality: health.quality, qualityNote: parts.length ? parts.join(', ') : null })
    }
    quality.value = worstQuality(results)
  }

  function startStats() {
    statsTimer ??= setInterval(() => void measureConnections(), STATS_EVERY_MS)
  }
  function stopStats() {
    if (statsTimer) clearInterval(statsTimer)
    statsTimer = null
    samples.clear()
    quality.value = null
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

  /** `timeoutMs`: longer for answers the AI writes. */
  function emit<T = Ack>(event: string, payload: unknown = {}, timeoutMs = 10_000) {
    return new Promise<T>((resolve) => {
      if (!boundSocket?.connected) return resolve({ ok: false, error: 'Not connected. Check your connection.' } as T)
      boundSocket.timeout(timeoutMs).emit(event, payload, (error: Error | null, response: T) =>
        resolve(error ? ({ ok: false, error: 'No answer from Vector. Check your connection.' } as T) : response),
      )
    })
  }
  async function act(event: string, payload: unknown = {}, timeoutMs?: number) {
    const result = await emit(event, payload, timeoutMs)
    if (!result.ok) throw new Error(result.error ?? 'That did not work. Try again.')
    return result
  }

  function addReaction(socketId: string, emoji: string) {
    const key = (reactionKey += 1)
    reactions.value = [...reactions.value, { key, tileId: socketId === selfId.value ? 'self' : socketId, emoji }]
    setTimeout(() => (reactions.value = reactions.value.filter((item) => item.key !== key)), 4000)
  }

  function addChat(message: CallChatMessage) {
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
    const [result, asked] = await Promise.all([
      emit<{ ok: boolean; polls?: MeetingPoll[]; board?: { open: boolean; strokes: WhiteboardStroke[] } }>('meeting:collab'),
      emit('meeting:qa:list'),
    ])
    if (asked.ok) questions.value = asked.questions ?? []
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
  const onMoved = async (payload: { room: string | null; roomName: string | null; peers: PeerInfo[]; chat?: CallChatMessage[]; media?: MediaRoute }) => {
    const changedRoom = payload.room !== room.value
    room.value = payload.room
    roomName.value = payload.roomName
    // With the media server, each room is its own media room: move there before connecting to the people in it.
    if (changedRoom && payload.media?.mode === 'sfu') {
      reconcile([])
      await useRoute(payload.media)
    }
    reconcile(payload.peers)
    if (changedRoom && payload.chat) {
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
    callError.value =
      reason === 'guests-off'
        ? 'The host turned off guest access.'
        : reason === 'locked'
          ? 'The host locked the call, so nobody new can join right now.'
          : 'Nobody let you in this time. You can ask again.'
    stopWatching()
    bind(null)
    status.value = 'preview'
  }
  /**
   * Someone running the call turned this microphone off (`by`), or the host does not allow unmuting now (`by` null).
   * Turning it back on stays up to this person when the host allows it.
   */
  function forceMute(by: string | null) {
    const track = audioTrack()
    if (track) track.enabled = false
    if (!media.audio) return
    media.audio = false
    void refreshOutgoing()
    shareMedia()
    if (by) toast(`${by} muted you`, { description: permissions.value.unmute || canManage.value ? 'Unmute when you want to speak.' : undefined })
    else toast('The host turned off unmuting for now')
  }
  const onMuted = ({ by }: { by: string | null }) => forceMute(by)
  const onStopShare = ({ by }: { by: string | null }) => {
    if (!media.screen) return
    void stopScreenShare()
    toast(by ? `${by} stopped your screen sharing` : 'The host turned off screen sharing for now')
  }
  const onPermissions = ({ permissions: next, by }: { permissions: CallPermissions; by: string }) => {
    const before = permissions.value
    permissions.value = next
    if (canManage.value) return
    if (before.chat !== next.chat) toast(next.chat ? `${by} turned chat back on` : `${by} turned chat off`)
    if (before.share !== next.share) toast(next.share ? `${by} allows screen sharing again` : `${by} turned off screen sharing`)
    if (before.unmute !== next.unmute) toast(next.unmute ? `${by} allows unmuting again` : `${by} muted everyone and turned off unmuting`)
  }
  const onSpotlight = ({ socketId, by }: { socketId: string | null; by?: string }) => {
    spotlight.value = socketId
    if (socketId === selfId.value && by) toast(`${by} put you in the spotlight`, { description: 'Everyone sees you large now.' })
  }
  const onRecording = ({ recording: next }: { recording: { by: string; since: string } | null }) => {
    const started = !recording.value && next
    recording.value = next
    if (started && !recordingHere.value) toast(`${next.by} started recording the call`, { description: 'Everyone in the call can watch the recording afterwards.' })
  }
  const onTranscribing = ({ transcribing: next, by }: { transcribing: Transcribing | null; by: string }) => {
    const changed = Boolean(transcribing.value) !== Boolean(next)
    transcribing.value = next
    if (!next) captions.value = []
    if (!changed || by === selfUser.value?.name) return
    if (!next) toast(`${by} turned off live captions`)
    else if (next.mode === 'ai') toast(`${by} turned on AI notes`, { description: 'What is said is turned into captions and notes for the meeting, and the assistant can follow along.' })
    else toast(`${by} turned on live captions`)
  }
  /** Translations that arrived before (or after) the caption they belong to. */
  const translations = new Map<string, string>()
  const onCaption = (caption: Omit<Caption, 'at'>) => {
    const entry = { ...caption, translated: translations.get(caption.id), at: Date.now() }
    const known = captions.value.findIndex((item) => item.id === caption.id)
    const list = known >= 0 ? captions.value.map((item, index) => (index === known ? entry : item)) : [...captions.value, entry]
    captions.value = list.filter((item) => !item.final || Date.now() - item.at < CAPTION_LINGER_MS).slice(-4)
    if (caption.final) setTimeout(() => (captions.value = captions.value.filter((item) => item.id !== caption.id || !item.final)), CAPTION_LINGER_MS)
  }
  const onCaptionTranslation = ({ id, language, text }: { id: string; language: string; text: string }) => {
    if (language !== captionLanguage.value) return
    translations.set(id, text)
    if (translations.size > 200) translations.delete(translations.keys().next().value!)
    captions.value = captions.value.map((item) => (item.id === id ? { ...item, translated: text, at: Date.now() } : item))
  }
  const onRemoved = ({ meetingId: id }: { meetingId: string }) => {
    if (id !== meetingId.value) return
    closedReason.value = 'removed'
    leave()
  }
  const onRole = ({ role: next, by }: { role: CallRole; by: string }) => {
    role.value = next
    canManage.value = Boolean(next)
    toast(next ? `${by} made you a co-host` : `${by} took back your co-host role`)
  }
  const onLocked = ({ locked: next, by }: { locked: boolean; by: string }) => {
    locked.value = next
    toast(next ? `${by} locked the call` : `${by} unlocked the call`)
  }

  const onLobbyMode = ({ mode, by }: { mode: MeetingLobby; by: string }) => {
    lobbyMode.value = mode
    if (inCall.value && canManage.value && by !== selfUser.value?.name) toast(mode === 'everyone' ? `${by}: everyone waits in the lobby now` : `${by}: only guests wait in the lobby now`)
  }
  const onBreakoutsEnded = ({ reason, by }: { reason: 'time' | 'host'; by: string | null }) =>
    toast(reason === 'time' ? 'Time is up: everyone is back in the main room' : `${by ?? 'The host'} closed the breakout rooms`)

  function upsertQuestion(question: MeetingQuestion) {
    const known = questions.value.some((item) => item.id === question.id)
    questions.value = known ? questions.value.map((item) => (item.id === question.id ? question : item)) : [...questions.value, question]
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
    'meeting:muted': onMuted,
    'meeting:removed': onRemoved,
    'meeting:role': onRole,
    'meeting:peer-role': ({ socketId, role: next }: { socketId: string; role: CallRole }) => updatePeer(socketId, { role: next }),
    'meeting:locked': onLocked,
    'meeting:stop-share': onStopShare,
    'meeting:permissions': onPermissions,
    'meeting:spotlight': onSpotlight,
    'meeting:recording': onRecording,
    'meeting:transcribing': onTranscribing,
    'meeting:caption': onCaption,
    'meeting:caption-translation': onCaptionTranslation,
    'meeting:lobby-mode': onLobbyMode,
    'meeting:breakouts:ended': onBreakoutsEnded,
    'meeting:qa': upsertQuestion,
    'meeting:qa:removed': ({ id }: { id: string }) => (questions.value = questions.value.filter((item) => item.id !== id)),
    'meeting:phone:joined': ({ name }: { name: string }) => toast(`${name} joined by phone`),
    'meeting:phone:muted': ({ identity, by }: { identity: string; by: string }) => {
      const caller = phoneCallers.value.find((item) => item.identity === identity)
      if (caller && by !== selfUser.value?.name) toast(`${by} muted ${caller.name}`)
    },
    disconnect: onSocketDown,
    connect: onSocketUp,
  } as const

  const handlerList = Object.entries(HANDLERS) as Array<[string, SocketHandlers[string]]>
  function bind(socket: Socket | null) {
    for (const [event, handler] of handlerList) boundSocket?.off(event, handler)
    boundSocket = socket
    for (const [event, handler] of handlerList) boundSocket?.on(event, handler)
  }

  function enterRoom(socket: Socket) {
    return new Promise<JoinResult>((resolve) =>
      socket.timeout(10_000).emit('meeting:join', { meetingId: meetingId.value, media: { ...media } }, (error: Error | null, response: JoinResult) =>
        resolve(error ? { ok: false, error: 'The meeting did not answer. Check your connection and try again.' } : response),
      ),
    )
  }

  function closeConnections() {
    for (const socketId of new Set([...connections.keys(), ...streams.keys()])) dropPeer(socketId)
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
      lobbyMode.value = result.lobbyMode ?? lobbyMode.value
      waitingAlone.value = Boolean(result.alone)
      status.value = 'waiting'
      return
    }
    waitingAlone.value = false
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
    role.value = result.role ?? null
    locked.value = Boolean(result.locked)
    permissions.value = result.permissions ?? { ...DEFAULT_PERMISSIONS }
    spotlight.value = result.spotlight ?? null
    recording.value = result.recording ?? null
    transcribing.value = result.transcribing ?? null
    capacity.value = result.capacity ?? null
    room.value = null
    roomName.value = null
    chat.value = result.chat ?? []
    breakouts.value = result.breakouts ?? null
    lobby.value = result.lobby ?? []
    lobbyMode.value = result.lobbyMode ?? 'guests'
    aiAvailable.value = Boolean(result.ai)
    if (captionLanguage.value && aiAvailable.value) boundSocket?.emit('meeting:caption-language', { language: captionLanguage.value })
    // The host may not allow unmuting right now: join muted.
    if (media.audio && !canManage.value && !permissions.value.unmute) forceMute(null)
    await useRoute(result.media)
    reconcile(result.peers ?? [])
    status.value = 'joined'
    if (media.audio || media.video) shareMedia()
    if (hand.value) boundSocket?.emit('meeting:hand', { raised: true })
    startMeters()
    startStats()
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
    // The app may replace its connection (e.g. after signing in again); follow it so the call survives.
    socketWatch ??= onSocketChange((current) => {
      if (current && current !== boundSocket) void rejoin()
    })
    setMediaSession()
  }

  function stopWatching() {
    socketWatch?.()
    socketWatch = null
  }

  /** Leaves the call (or the lobby) and releases the camera and microphone. A recording made here is still saved. */
  function leave() {
    if (recordingHere.value) void stopRecording()
    if (meetingId.value) boundSocket?.emit('meeting:leave')
    stopWatching()
    bind(null)
    closeConnections()
    void sfu.disconnect()
    route = { mode: 'direct' }
    stopMeters()
    stopStats()
    captioner.stop()
    stopSpeechRecorders()
    releaseScreen()
    stopBlur()
    stopNoise()
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
    questions.value = []
    phoneCallers.value = []
    waitingAlone.value = false
    locked.value = false
    permissions.value = { ...DEFAULT_PERMISSIONS }
    spotlight.value = null
    recording.value = null
    transcribing.value = null
    captions.value = []
    translations.clear()
    assistantTurns.value = []
    aiAvailable.value = false
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
    role.value = null
    if (status.value === 'left') status.value = 'idle'
  }

  // --- Controls -------------------------------------------------------------------------------------------------

  /** Mutes or unmutes; asks for the microphone first when it was not allowed or found before. */
  async function toggleAudio() {
    if (!media.audio && inCall.value && !canManage.value && !permissions.value.unmute) throw new Error('The host turned off unmuting for now.')
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

  /** Changes what is behind this person on camera (kept for their next calls on this device). */
  async function setBackground(choice: BackgroundChoice) {
    if (choice.kind !== 'none' && !blurSupported) throw new Error('This browser cannot change the background.')
    background.value = choice
    saveChoice(choice)
    await applyBlur()
    await refreshOutgoing()
  }
  /** Blur on, or the background back to normal. */
  const toggleBlur = () => setBackground(background.value.kind === 'none' ? { kind: 'blur' } : { kind: 'none' })

  async function toggleNoise() {
    if (!noiseSupported) throw new Error('This browser cannot remove background noise.')
    noiseOn.value = !noiseOn.value
    localStorage.setItem(NOISE_KEY, noiseOn.value ? '1' : '0')
    await applyNoise()
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
    if (!canManage.value && !permissions.value.share) throw new Error('The host turned off screen sharing for now.')
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
      throw new Error('Could not share your screen.', { cause: error })
    }
  }

  function toggleHand() {
    const raised = !hand.value
    hand.value = raised ? Date.now() : null
    boundSocket?.emit('meeting:hand', { raised })
  }
  const lowerHand = (socketId: string) => boundSocket?.emit('meeting:hand', { socketId, raised: false })
  const sendReaction = (emoji: string) => boundSocket?.emit('meeting:reaction', { emoji })
  const sendChat = (body: string, fileId?: string) => act('meeting:chat', { body, fileId })
  /** Uploads a file to the meeting and shares it in the chat with `body` (people from the organization only). */
  async function shareFile(file: File, body = '', onProgress?: (percent: number) => void) {
    if (isGuest.value || !meetingId.value) throw new Error('Only people from the organization can share files.')
    const uploaded = await meetingsApi.uploadFile(meetingId.value, file, onProgress)
    await sendChat(body, uploaded.id)
  }
  /** A short-lived address for a file shared in this call's chat. */
  async function fileUrl(fileId: string) {
    const result = await act('meeting:file-link', { fileId })
    return result.url!
  }
  const admit = (socketId: string, allow: boolean) => boundSocket?.emit('meeting:admit', { socketId, allow })
  /** People who may let others in now: with the lobby for everyone, only the people running the call. */
  const canAdmit = computed(() => !isGuest.value && (lobbyMode.value === 'guests' || canManage.value))
  async function setLobbyMode(mode: MeetingLobby) {
    await act('meeting:lobby-mode', { mode })
    lobbyMode.value = mode
  }

  /** `minutes`: the rooms close by themselves after this long (none: when the host closes them). */
  const openBreakouts = (rooms: Array<{ name: string; socketIds: string[] }>, minutes: number | null = null) =>
    act('meeting:breakouts:open', { rooms, ...(minutes ? { minutes } : {}) })
  const extendBreakouts = (minutes: number) => act('meeting:breakouts:extend', { minutes })
  const moveToRoom = (socketId: string | null, roomId: string | null) => act('meeting:breakouts:move', { socketId, room: roomId })
  const closeBreakouts = () => act('meeting:breakouts:close')
  const broadcastToRooms = (body: string) => act('meeting:breakouts:broadcast', { body })

  // A minute before breakout rooms close by themselves, everyone is told.
  let breakoutWarning: ReturnType<typeof setTimeout> | undefined
  watch(
    () => breakouts.value?.endsAt ?? null,
    (endsAt) => {
      clearTimeout(breakoutWarning)
      const delay = endsAt ? new Date(endsAt).getTime() - Date.now() - 60_000 : -1
      if (delay >= 0) breakoutWarning = setTimeout(() => toast('Breakout rooms close in 1 minute', { description: 'Everyone comes back to the main room then.' }), delay)
    },
  )

  // --- Q&A ----------------------------------------------------------------------------------------------------------

  /**
   * Posts a question. With the AI assistant, when one like it is already open, nothing is posted and that one is
   * returned (`similar`): the person can upvote it instead, or ask again with `force`.
   */
  async function askQuestion(text: string, force = false): Promise<{ similar: MeetingQuestion | null }> {
    const result = await act('meeting:qa:ask', { text, force }, 20_000)
    if (result.question) upsertQuestion(result.question)
    return { similar: result.similar ?? null }
  }
  const upvoteQuestion = (questionId: string) => act('meeting:qa:upvote', { questionId })
  /** Marks a question answered (or open again); `answer` is shown to everyone under it. */
  const answerQuestion = (questionId: string, answered = true, answer?: string) => act('meeting:qa:answer', { questionId, answered, ...(answer !== undefined ? { answer } : {}) })
  /** The host merges open questions that ask the same thing; returns how many were folded in. */
  async function mergeQuestions() {
    const result = await act('meeting:qa:merge', {}, 60_000)
    return result.merged ?? 0
  }
  /** An answer drafted by the AI assistant, for the host to edit and publish. */
  async function draftAnswer(questionId: string) {
    const result = await act('meeting:qa:draft', { questionId }, 60_000)
    return result.draft ?? ''
  }
  const removeQuestion = (questionId: string) => act('meeting:qa:remove', { questionId })

  // --- Phone callers ------------------------------------------------------------------------------------------------

  const mutePhone = (identity: string) => act('meeting:phone:mute', { identity })
  const removePhone = (identity: string) => act('meeting:phone:remove', { identity })

  const requestPanel = (tab: string) => (panelRequest.value = { tab, at: Date.now() })

  /** Whether this person may mute or remove someone with `other` role (only people ranked below them). */
  const canModerate = (other: CallRole) => canManage.value && roleRank(other) < roleRank(role.value)
  const mutePerson = (socketId: string) => act('meeting:mute', { socketId })
  async function muteEveryone() {
    const result = (await act('meeting:mute-all')) as Ack & { muted?: number }
    return result.muted ?? 0
  }
  const removePerson = (socketId: string) => act('meeting:remove', { socketId })
  async function setLocked(next: boolean) {
    await act('meeting:lock', { locked: next })
    locked.value = next
  }
  const setCohost = (socketId: string, cohost: boolean) => act('meeting:cohost', { socketId, cohost })
  const stopShareOf = (socketId: string) => act('meeting:stop-share', { socketId })
  async function setPermissions(changes: Partial<CallPermissions>) {
    await act('meeting:permissions', changes)
    permissions.value = { ...permissions.value, ...changes }
  }
  const setSpotlight = (socketId: string | null) => act('meeting:spotlight', { socketId })

  // --- Live captions ----------------------------------------------------------------------------------------------

  const captioner = createCaptioner(
    (part) => boundSocket?.emit('meeting:caption', part),
    (reason) => (deviceNote.value = reason),
  )
  // Without the AI assistant, each browser captions its own speaker while captions and its microphone are on.
  watch(
    () => Boolean(inCall.value && transcribing.value && transcribing.value.mode !== 'ai' && media.audio),
    (on) => (on && captionsSupported ? captioner.start() : captioner.stop()),
  )
  const setTranscribing = (on: boolean) => act('meeting:transcribe', { on })

  // --- AI notes: short recordings of speech, turned into text by the server ---------------------------------------

  const speechRecorders = new Map<string, SpeechRecorder>()
  function stopSpeechRecorders() {
    for (const speech of speechRecorders.values()) speech.stop()
    speechRecorders.clear()
  }
  async function sendSpeech(piece: SpeechPiece, phone?: { identity: string; name: string }) {
    if (!boundSocket?.connected || piece.audio.size < 1500) return
    const audio = await piece.audio.arrayBuffer()
    boundSocket.emit('meeting:audio', { audio, mimeType: piece.mimeType, durationMs: piece.durationMs, ...(phone ? { phone } : {}) })
  }
  /** One person running the call records phone callers (the one first in order, so it is done once). */
  const recordsPhones = computed(
    () => canManage.value && !isGuest.value && !peers.value.some((peer) => roleRank(peer.role) > 0 && !peer.guest && peer.socketId < (selfId.value ?? '')),
  )
  watch(
    () => {
      const on = inCall.value && transcribing.value?.mode === 'ai' && aiNotesSupported
      // The revisions make the key change when the microphone (or its noise-free copy) is replaced.
      const own = on && media.audio ? `self:${audioRevision.value}.${localRevision.value}:${outgoingAudio()?.id ?? ''}` : ''
      const phones = on && recordsPhones.value ? phoneCallers.value.map((caller) => `${caller.identity}:${caller.stream?.getAudioTracks()[0]?.id ?? ''}`) : []
      return [own, ...phones].filter((key) => key && !key.endsWith(':')).join('|')
    },
    (wanted) => {
      const keys = new Set(wanted ? wanted.split('|') : [])
      for (const [key, speech] of speechRecorders) {
        if (keys.has(key)) continue
        speech.stop()
        speechRecorders.delete(key)
      }
      for (const key of keys) {
        if (speechRecorders.has(key)) continue
        if (key.startsWith('self:')) {
          const track = outgoingAudio()
          if (track) speechRecorders.set(key, recordSpeech(track, (piece) => void sendSpeech(piece)))
          continue
        }
        const identity = key.slice(0, key.lastIndexOf(':'))
        const caller = phoneCallers.value.find((item) => item.identity === identity)
        const track = caller?.stream?.getAudioTracks()[0]
        if (caller && track) speechRecorders.set(key, recordSpeech(track, (piece) => void sendSpeech(piece, { identity, name: caller.name })))
      }
    },
  )

  /** The language this person reads captions in (null: as spoken); translation needs the AI assistant. */
  async function setCaptionLanguage(language: string | null) {
    captionLanguage.value = language
    if (language) localStorage.setItem(CAPTION_LANGUAGE_KEY, language)
    else localStorage.removeItem(CAPTION_LANGUAGE_KEY)
    translations.clear()
    captions.value = captions.value.map((item) => ({ ...item, translated: undefined }))
    if (inCall.value) await act('meeting:caption-language', { language })
  }

  // --- The in-call assistant --------------------------------------------------------------------------------------

  let turnKey = 0
  /** "Catch me up" (no question) or a question about the meeting so far; only this person sees the answer. */
  async function askAssistant(question: string | null = null) {
    const turn: AssistantTurn = { id: (turnKey += 1), question, answer: null, error: null, at: Date.now() }
    assistantTurns.value = [...assistantTurns.value, turn]
    assistantBusy.value = true
    const result = await emit('meeting:ai:ask', { question }, 60_000)
    assistantBusy.value = false
    assistantTurns.value = assistantTurns.value.map((item) =>
      item.id === turn.id ? { ...item, answer: result.ok ? (result.answer ?? '') : null, error: result.ok ? null : (result.error ?? 'The assistant could not answer.') } : item,
    )
  }
  function toggleCaptionsView() {
    showCaptions.value = !showCaptions.value
    localStorage.setItem(CAPTIONS_KEY, showCaptions.value ? '1' : '0')
  }

  // --- Recording ----------------------------------------------------------------------------------------------------

  const voices = () => [outgoingAudio(), ...peers.value.map((peer) => peer.stream?.getAudioTracks()[0] ?? null)].filter((track): track is MediaStreamTrack => Boolean(track))
  watch(
    () => [peers.value.map((peer) => `${peer.socketId}:${peer.revision}`).join(), localRevision.value, audioRevision.value, media.audio] as const,
    () => recorder?.setAudio(voices()),
  )

  /** Records the call in this browser; everyone is told. The file is uploaded to the meeting when it stops. */
  async function startRecording() {
    if (!recordingSupported) throw new Error('This browser cannot record calls. Use Chrome or Edge on a computer.')
    const started = await act('meeting:recording', { on: true })
    const id = started.recordingId!
    const forMeeting = meetingId.value!
    try {
      recorder = await startRecorder(() => void stopRecording())
    } catch (error) {
      await emit('meeting:recording', { on: false })
      await meetingsApi.removeRecording(forMeeting, id).catch(() => undefined)
      if (error instanceof DOMException && error.name === 'NotAllowedError') return
      throw new Error('Recording could not start: choose this tab when the browser asks what to record.', { cause: error })
    }
    recordingId = id
    recordingHere.value = true
    recorder.setAudio(voices())
  }

  async function stopRecording() {
    const current = recorder
    const id = recordingId
    const forMeeting = meetingId.value
    if (!current || !id || !forMeeting) return
    recorder = null
    recordingId = null
    recordingHere.value = false
    void emit('meeting:recording', { on: false })
    const finished = await current.stop()
    uploadProgress.value = 0
    try {
      await meetingsApi.uploadRecording(forMeeting, id, finished.blob, finished.durationSeconds, (percent) => (uploadProgress.value = percent))
      toast.success('Recording saved', { description: 'Everyone invited can watch it from the meeting page.' })
    } catch (error) {
      toast.error(`The recording could not be saved: ${getErrorMessage(error)}`)
    } finally {
      uploadProgress.value = null
    }
  }

  // With the media server and a big call, only the person shown large comes in at full quality.
  watch(
    () => spotlight.value ?? peers.value.find((peer) => peer.media.screen)?.socketId ?? activeSpeaker.value,
    (identity) => sfu.feature(identity),
  )

  async function createPoll(question: string, options: string[]) {
    const result = await act('meeting:poll:create', { question, options })
    if (result.poll) upsertPoll(result.poll)
  }
  async function vote(pollId: string, option: number) {
    const result = await act('meeting:poll:vote', { pollId, option })
    if (result.poll) upsertPoll(result.poll)
  }
  const closePoll = (pollId: string) => act('meeting:poll:close', { pollId })

  /**
   * Adds a whiteboard item, or points to a freehand stroke being drawn here; others see it appear as it is drawn.
   * A long stroke (e.g. one put back with redo) is sent in parts the server accepts.
   */
  function drawStroke(part: Omit<WhiteboardStroke, 'owner'>) {
    if (!part.points.length) return
    addStrokePart({ ...part, owner: selfUser.value?.id ?? 'self' })
    if ((part.kind ?? 'path') !== 'path' || part.points.length <= BOARD_PART) return void boundSocket?.emit('meeting:wb:stroke', part)
    for (let index = 0; index < part.points.length; index += BOARD_PART) boundSocket?.emit('meeting:wb:stroke', { ...part, points: part.points.slice(index, index + BOARD_PART) })
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

  // --- Keyboard shortcuts (see call/shortcuts.ts) -------------------------------------------------------------------

  /** Unmuted only while the talk keys are held. */
  let talking = false
  const attempt = (task: () => unknown) =>
    void Promise.resolve()
      .then(task)
      .catch((error: unknown) => toast.error(getErrorMessage(error)))

  function onShortcut(event: KeyboardEvent) {
    if (!inCall.value) return
    if (isTalkKey(event)) {
      event.preventDefault()
      if (!event.repeat && !media.audio && !talking) {
        talking = true
        attempt(async () => {
          try {
            await toggleAudio()
          } catch (error) {
            talking = false
            throw error
          }
        })
      }
      return
    }
    const action = callShortcutFor(event)
    if (!action) return
    event.preventDefault()
    if (event.repeat) return
    const actions: Record<CallShortcutAction, () => unknown> = {
      mute: toggleAudio,
      camera: toggleVideo,
      share: toggleScreenShare,
      hand: toggleHand,
      chat: () => requestPanel('chat'),
      people: () => requestPanel('people'),
      qa: () => requestPanel('qa'),
      assistant: () => (aiAvailable.value ? requestPanel('assistant') : undefined),
      whiteboard: () => (isGuest.value ? undefined : setBoardOpen(!boardOpen.value)),
      leave,
      talk: () => undefined,
    }
    attempt(actions[action])
  }
  function stopTalking() {
    if (!talking) return
    talking = false
    if (media.audio) attempt(toggleAudio)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onShortcut)
    window.addEventListener('keyup', (event) => (event.code === 'Space' || event.key === 'Control' || event.key === 'Alt') && stopTalking())
    window.addEventListener('blur', stopTalking)
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
    role,
    locked,
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
    lobbyMode,
    waitingAlone,
    canAdmit,
    setLobbyMode,
    questions,
    phoneCallers,
    panelRequest,
    requestPanel,
    room,
    roomName,
    breakouts,
    polls,
    boardOpen,
    boardRevision,
    boardStrokes,
    blurOn,
    blurBusy,
    background,
    setBackground,
    noiseOn,
    noiseBusy,
    toggleNoise,
    aiAvailable,
    captionLanguage,
    setCaptionLanguage,
    assistantTurns,
    assistantBusy,
    askAssistant,
    mergeQuestions,
    draftAnswer,
    permissions,
    spotlight,
    recording,
    recordingHere,
    uploadProgress,
    transcribing,
    captions,
    showCaptions,
    quality,
    mediaMode,
    capacity,
    devices,
    chosenDevices,
    refreshDevices,
    chooseDevice,
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
    shareFile,
    fileUrl,
    admit,
    openBreakouts,
    extendBreakouts,
    moveToRoom,
    closeBreakouts,
    broadcastToRooms,
    askQuestion,
    upvoteQuestion,
    answerQuestion,
    removeQuestion,
    mutePhone,
    removePhone,
    canModerate,
    mutePerson,
    muteEveryone,
    removePerson,
    setLocked,
    setCohost,
    stopShareOf,
    setPermissions,
    setSpotlight,
    setTranscribing,
    toggleCaptionsView,
    startRecording,
    stopRecording,
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
