import type { LocalAudioTrack, LocalTrack, LocalVideoTrack, Participant, RemoteParticipant, RemoteTrack, Room, Track } from 'livekit-client'

/** How well someone's connection carries the call now. */
export type CallQuality = 'good' | 'fair' | 'poor' | 'lost'

export interface SfuHooks {
  /** A person's microphone, camera or screen arrived (or resumed). People are identified by their socket id. */
  onTrack: (identity: string, track: MediaStreamTrack) => void
  onTrackGone: (identity: string, track: MediaStreamTrack) => void
  onPresence: (identity: string, present: boolean) => void
  onQuality: (identity: string | 'self', quality: CallQuality) => void
  /** The media server muted this person's microphone or stopped their screen (host control). */
  onForcedOff: (kind: 'audio' | 'screen') => void
  onState: (state: 'connected' | 'reconnecting' | 'lost') => void
}

type LiveKit = typeof import('livekit-client')

/** The LiveKit library is only downloaded for calls that go through a media server. */
let library: Promise<LiveKit> | null = null
const loadLiveKit = () => (library ??= import('livekit-client'))

/** Above this many people, only the person shown large gets full-quality video; the rest come in small. */
const FULL_QUALITY_LIMIT = 6

/**
 * Media through a LiveKit server: this browser sends its microphone and camera (or screen) once, and receives
 * everyone else's. Used when the server has LiveKit configured; otherwise browsers connect to each other directly.
 */
export function createSfuTransport(hooks: SfuHooks) {
  let lk: LiveKit | null = null
  let room: Room | null = null
  let leaving = false
  const published: { audio?: LocalAudioTrack; video?: LocalVideoTrack; videoSource?: Track.Source } = {}
  let featured: string | null = null

  const identityOf = (participant: Participant) => participant.identity

  function qualityOf(value: string): CallQuality | null {
    const { ConnectionQuality } = lk!
    if (value === ConnectionQuality.Excellent || value === ConnectionQuality.Good) return 'good'
    if (value === ConnectionQuality.Poor) return 'poor'
    if (value === ConnectionQuality.Lost) return 'lost'
    return null
  }

  function wire(target: Room) {
    const { RoomEvent, Track: TrackKind } = lk!
    target
      .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _publication, participant: RemoteParticipant) => {
        hooks.onTrack(identityOf(participant), track.mediaStreamTrack)
        applyQuality()
      })
      .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _publication, participant: RemoteParticipant) => hooks.onTrackGone(identityOf(participant), track.mediaStreamTrack))
      .on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (participant !== target.localParticipant && publication.track) hooks.onTrack(identityOf(participant), publication.track.mediaStreamTrack)
      })
      .on(RoomEvent.TrackMuted, (publication, participant) => {
        if (participant !== target.localParticipant) return
        if (publication.source === TrackKind.Source.Microphone) hooks.onForcedOff('audio')
        if (publication.source === TrackKind.Source.ScreenShare) hooks.onForcedOff('screen')
      })
      .on(RoomEvent.LocalTrackUnpublished, (publication) => {
        // The server took away a permission (or we unpublished): forget the slot so it can be published again later.
        if (publication.track === published.audio) published.audio = undefined
        if (publication.track === published.video) {
          published.video = undefined
          published.videoSource = undefined
        }
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        hooks.onPresence(participant.identity, true)
        applyQuality()
      })
      .on(RoomEvent.ParticipantDisconnected, (participant) => hooks.onPresence(participant.identity, false))
      .on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
        const value = qualityOf(quality)
        if (value) hooks.onQuality(participant === target.localParticipant ? 'self' : participant.identity, value)
      })
      .on(RoomEvent.Reconnecting, () => hooks.onState('reconnecting'))
      .on(RoomEvent.Reconnected, () => hooks.onState('connected'))
      .on(RoomEvent.Disconnected, () => {
        if (!leaving && room === target) hooks.onState('lost')
      })
  }

  /** Joins the media room for the current call room (a breakout room has its own). */
  async function connect(url: string, token: string) {
    await disconnect()
    lk = await loadLiveKit()
    leaving = false
    const next = new lk.Room({ adaptiveStream: false, dynacast: true, disconnectOnPageLeave: true })
    room = next
    wire(next)
    await next.connect(url, token, { autoSubscribe: true })
    for (const participant of next.remoteParticipants.values()) hooks.onPresence(participant.identity, true)
    hooks.onState('connected')
  }

  async function disconnect() {
    const current = room
    room = null
    published.audio = undefined
    published.video = undefined
    published.videoSource = undefined
    if (!current) return
    leaving = true
    await current.disconnect(false).catch(() => undefined)
  }

  async function unpublish(track: LocalTrack | undefined) {
    if (track && room) await room.localParticipant.unpublishTrack(track, false).catch(() => undefined)
  }

  /** Sends this microphone track (null: none); `live` false keeps it published but muted. */
  async function sendAudio(track: MediaStreamTrack | null, live: boolean) {
    if (!room || !lk) return
    if (!track) {
      await unpublish(published.audio)
      published.audio = undefined
      return
    }
    if (published.audio && published.audio.mediaStreamTrack !== track) await published.audio.replaceTrack(track, true)
    if (!published.audio && live) {
      const local = new lk.LocalAudioTrack(track, undefined, true)
      published.audio = local
      try {
        await room.localParticipant.publishTrack(local, { source: lk.Track.Source.Microphone })
      } catch (error) {
        published.audio = undefined
        throw error
      }
    }
    if (published.audio) await (live ? published.audio.unmute() : published.audio.mute())
  }

  /** Sends this camera or screen track (null: none). Switching between camera and screen publishes anew. */
  async function sendVideo(track: MediaStreamTrack | null, screen: boolean) {
    if (!room || !lk) return
    const source = screen ? lk.Track.Source.ScreenShare : lk.Track.Source.Camera
    if (published.video && (!track || published.videoSource !== source)) {
      await unpublish(published.video)
      published.video = undefined
      published.videoSource = undefined
    }
    if (!track) return
    if (published.video) {
      if (published.video.mediaStreamTrack !== track) await published.video.replaceTrack(track, true)
      return
    }
    const local = new lk.LocalVideoTrack(track, undefined, true)
    published.video = local
    published.videoSource = source
    try {
      await room.localParticipant.publishTrack(local, { source, simulcast: !screen })
    } catch (error) {
      published.video = undefined
      published.videoSource = undefined
      throw error
    }
  }

  /** Big calls: full quality only for the person shown large, small video for everyone else. */
  function applyQuality() {
    if (!room || !lk) return
    const many = room.remoteParticipants.size > FULL_QUALITY_LIMIT
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.videoTrackPublications.values()) {
        const high = !many || participant.identity === featured || publication.source === lk.Track.Source.ScreenShare
        publication.setVideoQuality(high ? lk.VideoQuality.HIGH : lk.VideoQuality.LOW)
      }
    }
  }

  function feature(identity: string | null) {
    featured = identity
    applyQuality()
  }

  return { connect, disconnect, sendAudio, sendVideo, feature, connected: () => Boolean(room) }
}

export type SfuTransport = ReturnType<typeof createSfuTransport>
