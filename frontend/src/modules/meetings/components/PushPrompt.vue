<script setup lang="ts">
import { BellRing, BellOff, Smartphone } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { usePushNotifications } from '../call/usePushNotifications'

const props = withDefaults(
  defineProps<{
    /** Where this prompt is shown — changes the copy. */
    context?: 'calls' | 'messages' | 'settings'
  }>(),
  { context: 'calls' },
)

/** Device push for calls, DMs, mentions and standup nudges — even when Vector is closed. */
const push = usePushNotifications()
onMounted(() => void push.refresh())

const copy = computed(() => {
  if (props.context === 'messages') {
    return {
      on: 'Messages alert this device',
      off: 'Alert me for DMs and mentions',
      subscribed: 'You get a notification for DMs, @mentions and standup reminders, even when Vector is closed.',
      idle: 'Turn on so DMs, @mentions and standup nudges reach this phone or computer when Vector is closed.',
      successOn: 'This device now alerts for messages and standups',
      successOff: 'This device will no longer alert for messages',
    }
  }
  if (props.context === 'settings') {
    return {
      on: 'Push notifications on',
      off: 'Push notifications',
      subscribed: 'Calls, DMs, @mentions and standup reminders can reach this device when Vector is closed.',
      idle: 'Get calls, DMs, mentions and standup nudges even when Vector is closed.',
      successOn: 'Push notifications turned on for this device',
      successOff: 'Push notifications turned off for this device',
    }
  }
  return {
    on: 'Calls ring on this device',
    off: 'Ring my phone and computer for calls',
    subscribed: 'You also get DMs, @mentions and standup reminders here when Vector is closed.',
    idle: 'Get a notification when a call starts — and for DMs, mentions and standups — even when Vector is closed.',
    successOn: 'This device now rings for calls and alerts for messages',
    successOff: 'This device will no longer ring for calls',
  }
})

async function toggle() {
  try {
    if (push.state.subscribed) {
      await push.disable()
      toast.success(copy.value.successOff)
    } else {
      await push.enable()
      toast.success(copy.value.successOn)
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Could not change notifications')
  }
}
</script>

<template>
  <section
    v-if="push.state.supported || push.state.needsInstall"
    class="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft sm:flex-row sm:items-center"
  >
    <div class="flex min-w-0 flex-1 items-start gap-3">
      <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <BellRing v-if="push.state.subscribed" class="size-4" />
        <Smartphone v-else class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold leading-snug">{{ push.state.subscribed ? copy.on : copy.off }}</p>
        <p class="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          <template v-if="push.state.needsInstall">On iPhone and iPad, add Vector to your Home Screen first (Share → Add to Home Screen), then turn this on from the app.</template>
          <template v-else-if="push.state.permission === 'denied'">Notifications are blocked for Vector. Allow them in the browser’s site settings.</template>
          <template v-else-if="push.state.subscribed">{{ copy.subscribed }}</template>
          <template v-else>{{ copy.idle }}</template>
        </p>
      </div>
    </div>
    <Button
      v-if="!push.state.needsInstall"
      :variant="push.state.subscribed ? 'ghost' : 'brand'"
      size="sm"
      class="shrink-0 max-sm:w-full"
      :loading="push.state.busy"
      :disabled="push.state.permission === 'denied'"
      @click="toggle"
    >
      <BellOff v-if="push.state.subscribed" /> {{ push.state.subscribed ? 'Turn off' : 'Turn on' }}
    </Button>
  </section>
</template>
