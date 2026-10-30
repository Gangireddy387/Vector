import { computed, ref } from 'vue'
import type { CallQuality, CallRole, PeerConnection } from '../useMeetingCall'
import { type CallUser, useMeetingCall } from '../useMeetingCall'

export interface Tile {
  id: string
  stream: MediaStream | null
  user: CallUser | null
  label: string
  audio: boolean
  video: boolean
  screen: boolean
  self: boolean
  revision: number
  connection?: PeerConnection
  hand: number | null
  speaking: boolean
  guest: boolean
  callRole: CallRole
  quality: CallQuality | null
  qualityNote: string | null
  /** The host shows this person large for everyone. */
  spotlit: boolean
  /** This person chose to keep this tile large on their own screen. */
  pinned: boolean
}

/** A tile this person keeps large on their own screen (only here; the host's spotlight is for everyone). */
const pinned = ref<string | null>(null)

/** One tile per person in this room of the call, this person first; plus who to show when there is room for one. */
export function useCallTiles() {
  const call = useMeetingCall()

  const tiles = computed<Tile[]>(() => [
    {
      id: 'self',
      stream: call.selfStream.value,
      user: call.selfUser.value,
      label: call.media.screen ? 'You are presenting' : 'You',
      audio: call.media.audio,
      video: call.media.video,
      screen: call.media.screen,
      self: true,
      revision: call.localRevision.value,
      hand: call.hand.value,
      speaking: call.speaking.value.includes('self'),
      guest: call.isGuest.value,
      callRole: call.role.value,
      quality: call.quality.value,
      qualityNote: null,
      spotlit: call.spotlight.value === call.selfId.value,
      pinned: pinned.value === 'self',
    },
    ...call.peers.value.map((peer) => ({
      id: peer.socketId,
      stream: peer.stream,
      user: peer.user,
      label: peer.media.screen ? `${peer.user.name} is presenting` : peer.guest ? `${peer.user.name} (guest)` : peer.user.name,
      audio: peer.media.audio,
      video: peer.media.video,
      screen: peer.media.screen,
      self: false,
      revision: peer.revision,
      connection: peer.connection,
      hand: peer.hand,
      speaking: call.speaking.value.includes(peer.socketId),
      guest: peer.guest,
      callRole: peer.role ?? null,
      quality: peer.quality,
      qualityNote: peer.qualityNote,
      spotlit: call.spotlight.value === peer.socketId,
      pinned: pinned.value === peer.socketId,
    })),
  ])

  /**
   * Who gets the big tile: someone presenting (others before yourself), else the tile this person pinned, else the
   * person the host put in the spotlight.
   */
  const presenter = computed(
    () =>
      tiles.value.find((tile) => tile.screen && !tile.self) ??
      tiles.value.find((tile) => tile.screen) ??
      tiles.value.find((tile) => tile.pinned) ??
      tiles.value.find((tile) => tile.spotlit) ??
      null,
  )

  /** For a single tile (small window, picture-in-picture): the presenter, else whoever spoke last, else someone else. */
  const featured = computed(
    () =>
      presenter.value ??
      tiles.value.find((tile) => tile.id === call.activeSpeaker.value) ??
      tiles.value.find((tile) => !tile.self) ??
      tiles.value[0]!,
  )

  /** Raised hands, first raised first. */
  const raisedHands = computed(() => tiles.value.filter((tile) => tile.hand).sort((a, b) => (a.hand ?? 0) - (b.hand ?? 0)))

  const togglePin = (id: string) => (pinned.value = pinned.value === id ? null : id)

  return { tiles, presenter, featured, raisedHands, togglePin }
}
