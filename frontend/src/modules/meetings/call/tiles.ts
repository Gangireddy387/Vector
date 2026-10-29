import { computed } from 'vue'
import type { PeerConnection } from '../useMeetingCall'
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
}

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
    })),
  ])

  /** Someone presenting gets the big tile (others before yourself). */
  const presenter = computed(() => tiles.value.find((tile) => tile.screen && !tile.self) ?? tiles.value.find((tile) => tile.screen) ?? null)

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

  return { tiles, presenter, featured, raisedHands }
}
