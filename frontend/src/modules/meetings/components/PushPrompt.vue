<script setup lang="ts">
import { BellOff, BellRing, Smartphone } from 'lucide-vue-next'
import type { HTMLAttributes } from 'vue'
import { computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { usePushNotifications } from '../call/usePushNotifications'

const props = withDefaults(
  defineProps<{
    /** Where this prompt is shown — changes the copy. */
    context?: 'calls' | 'messages' | 'settings'
    class?: HTMLAttributes['class']
  }>(),
  { context: 'calls' },
)

/** Device push for calls, DMs, mentions and standup nudges — even when Vector is closed. */
const push = usePushNotifications()
onMounted(() => void push.refresh())

const copy = computed(() => {
  if (props.context === 'messages') {
    return {
      on: 'Alerts on',
      off: 'Alert me for DMs & mentions',
      subscribed: 'DMs, @mentions and standup reminders reach this device when Vector is closed.',
      idle: 'Get DMs, @mentions and standup nudges here when Vector is closed.',
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

const hint = computed(() => {
  if (push.state.needsInstall) {
    return 'On iPhone and iPad, add Vector to your Home Screen first (Share → Add to Home Screen), then turn this on from the app.'
  }
  if (push.state.permission === 'denied') {
    return 'Notifications are blocked for Vector. Allow them in the browser’s site settings.'
  }
  return push.state.subscribed ? copy.value.subscribed : copy.value.idle
})

const messagesLabel = computed(() =>
  push.state.subscribed ? 'Turn off message alerts on this device' : 'Turn on alerts for DMs and @mentions',
)

const messagesTooltipTitle = computed(() =>
  push.state.permission === 'denied'
    ? 'Notifications blocked'
    : push.state.subscribed
      ? 'Message alerts on'
      : 'Get alerts on this device',
)

const messagesTooltipBody = computed(() => {
  if (push.state.permission === 'denied') {
    return 'Allow notifications for Vector in your browser site settings, then turn this back on.'
  }
  if (push.state.subscribed) {
    return 'DMs, @mentions and standup nudges reach this device when Vector is closed. Click to turn off.'
  }
  return 'Turn on to get DMs, @mentions and standup nudges here even when Vector is closed.'
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
  <!-- Messages header: one bell that matches Search / Saved. -->
  <Tooltip v-if="(push.state.supported || push.state.needsInstall) && context === 'messages' && !push.state.needsInstall">
    <TooltipTrigger as-child>
      <Button
        :variant="push.state.subscribed ? 'soft' : 'ghost'"
        size="icon-sm"
        :class="cn(props.class)"
        :loading="push.state.busy"
        :disabled="push.state.permission === 'denied'"
        :aria-label="messagesLabel"
        :aria-pressed="push.state.subscribed"
        @click="toggle"
      >
        <BellRing v-if="push.state.subscribed" class="text-primary" />
        <BellOff v-else />
      </Button>
    </TooltipTrigger>
    <TooltipContent side="bottom" class="max-w-[16rem] space-y-0.5 text-left font-normal">
      <p class="font-medium">{{ messagesTooltipTitle }}</p>
      <p class="text-[11px] leading-snug text-muted-foreground">{{ messagesTooltipBody }}</p>
    </TooltipContent>
  </Tooltip>

  <section
    v-else-if="push.state.supported || push.state.needsInstall"
    class="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-3 shadow-soft sm:flex-row sm:items-center"
  >
    <div class="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
      <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:mt-0">
        <BellRing v-if="push.state.subscribed" class="size-4" />
        <Smartphone v-else class="size-4" />
      </span>
      <div class="min-w-0 flex-1 space-y-1">
        <p class="text-sm font-semibold leading-snug text-balance">{{ push.state.subscribed ? copy.on : copy.off }}</p>
        <p class="text-xs leading-relaxed text-pretty text-muted-foreground">{{ hint }}</p>
      </div>
    </div>
    <Button
      v-if="!push.state.needsInstall"
      :variant="push.state.subscribed ? 'ghost' : 'brand'"
      size="sm"
      class="shrink-0"
      :loading="push.state.busy"
      :disabled="push.state.permission === 'denied'"
      @click="toggle"
    >
      <BellOff v-if="push.state.subscribed" /> {{ push.state.subscribed ? 'Turn off' : 'Turn on' }}
    </Button>
  </section>
</template>
