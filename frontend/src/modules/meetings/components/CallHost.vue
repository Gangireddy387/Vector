<script setup lang="ts">
import { watch } from 'vue'
import { usePictureInPicture } from '../call/usePictureInPicture'
import { useMeetingCall } from '../useMeetingCall'
import CallAudio from './CallAudio.vue'
import MiniCall from './MiniCall.vue'

/**
 * Mounted once for the whole app: plays the call's sound on every page and renders the pop-out (picture-in-picture)
 * window. Switching to another tab during a call pops it out automatically where the browser allows it.
 */
const call = useMeetingCall()
const pip = usePictureInPicture()

watch(
  () => call.inCall.value,
  (inCall) => {
    if (!inCall) pip.close()
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.setActionHandler('enterpictureinpicture' as MediaSessionAction, inCall ? () => void pip.open().catch(() => undefined) : null)
    } catch {
      // This browser does not pop out on its own.
    }
  },
)
</script>

<template>
  <CallAudio />
  <Teleport v-if="pip.pipBody.value" :to="pip.pipBody.value">
    <MiniCall variant="pip" />
  </Teleport>
</template>
