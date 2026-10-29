<script setup lang="ts">
import { BellRing, BellOff, Smartphone } from 'lucide-vue-next'
import { onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '../call/usePushNotifications'

/** Lets this device (phone, computer, installed app) ring when a call starts, even when Vector is closed. */
const push = usePushNotifications()
onMounted(() => void push.refresh())

async function toggle() {
  try {
    if (push.state.subscribed) {
      await push.disable()
      toast.success('This device will no longer ring for calls')
    } else {
      await push.enable()
      toast.success('This device now rings when a call starts')
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not change notifications')
  }
}
</script>

<template>
  <section v-if="push.state.supported || push.state.needsInstall" class="flex flex-wrap items-center gap-3 border border-border/70 bg-card p-3 shadow-soft">
    <span class="flex size-9 shrink-0 items-center justify-center bg-primary/10 text-primary">
      <BellRing v-if="push.state.subscribed" class="size-4" />
      <Smartphone v-else class="size-4" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-semibold">{{ push.state.subscribed ? 'Calls ring on this device' : 'Ring my phone and computer for calls' }}</p>
      <p class="text-xs text-muted-foreground">
        <template v-if="push.state.needsInstall">On iPhone and iPad, add Vector to your Home Screen first (Share → Add to Home Screen), then turn this on from the app.</template>
        <template v-else-if="push.state.permission === 'denied'">Notifications are blocked for Vector. Allow them in the browser’s site settings to get calls here.</template>
        <template v-else-if="push.state.subscribed">You get a notification when someone starts a call you are invited to, even when Vector is closed.</template>
        <template v-else>Get a notification with “Join” when someone starts a call you are invited to, even when Vector is closed.</template>
      </p>
    </div>
    <Button v-if="!push.state.needsInstall" :variant="push.state.subscribed ? 'ghost' : 'brand'" size="sm" :loading="push.state.busy" :disabled="push.state.permission === 'denied'" @click="toggle">
      <BellOff v-if="push.state.subscribed" /> {{ push.state.subscribed ? 'Turn off' : 'Turn on' }}
    </Button>
  </section>
</template>
