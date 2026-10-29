<script setup lang="ts">
import { watch } from 'vue'
import { useMeetingCall } from '../useMeetingCall'

/**
 * Plays everyone's voice for as long as the call lasts, whichever page is open (video tiles come and go with pages and
 * the small call window).
 */
const call = useMeetingCall()
const players = new Map<string, { element: HTMLAudioElement; revision: number }>()

watch(
  () => call.peers.value.map((peer) => [peer.socketId, peer.stream, peer.revision] as const),
  (list) => {
    const present = new Set(list.map(([socketId]) => socketId))
    for (const [socketId, player] of players) {
      if (present.has(socketId)) continue
      player.element.srcObject = null
      players.delete(socketId)
    }
    for (const [socketId, stream, revision] of list) {
      let player = players.get(socketId)
      if (!player) {
        const element = new Audio()
        element.autoplay = true
        player = { element, revision: -1 }
        players.set(socketId, player)
      }
      if (player.element.srcObject === stream && player.revision === revision) continue
      // A track that arrives later in the same stream is only picked up when the stream is set again.
      player.element.srcObject = null
      player.element.srcObject = stream
      player.revision = revision
      if (stream) void player.element.play().catch(() => undefined)
    }
  },
  { immediate: true },
)
</script>

<template>
  <span hidden />
</template>
