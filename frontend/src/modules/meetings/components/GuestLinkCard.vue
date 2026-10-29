<script setup lang="ts">
import { Copy, Link2, RefreshCw } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { type Meeting, guestLinkUrl, meetingsApi } from '../meetings.api'

/** The host's switch for letting people outside the organization ask to join with a link. */
const props = defineProps<{ meeting: Meeting }>()
const emit = defineEmits<{ changed: [meeting: Meeting] }>()

const confirm = useConfirm()
const isSaving = ref(false)
const link = computed(() => (props.meeting.guestToken ? guestLinkUrl(props.meeting.guestToken) : ''))

async function save(enabled: boolean, reset = false) {
  isSaving.value = true
  try {
    emit('changed', await meetingsApi.setGuestAccess(props.meeting.id, enabled, reset))
    if (reset) toast.success('New guest link ready', { description: 'The old link no longer works.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.success('Guest link copied')
  } catch {
    toast.error('Copy the link from the box instead')
  }
}

async function reset() {
  const ok = await confirm({
    title: 'Make a new guest link?',
    description: 'The current link stops working. Send the new one to your guests.',
    confirmLabel: 'New link',
  })
  if (ok) await save(true, true)
}
</script>

<template>
  <section class="space-y-2.5 border border-border/70 bg-card p-3">
    <div class="flex items-start gap-3">
      <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><Link2 class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">Guests</p>
        <p class="text-xs text-muted-foreground">People outside your organization join with a link. They wait until someone in the call lets them in.</p>
      </div>
      <Switch :model-value="meeting.guestAccess" :disabled="isSaving" aria-label="Allow guests with a link" @update:model-value="(value) => save(Boolean(value))" />
    </div>
    <div v-if="meeting.guestAccess && link" class="flex items-center gap-1.5">
      <Input :model-value="link" readonly class="h-8 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
      <Button variant="outline" size="icon-sm" aria-label="Copy guest link" @click="copy"><Copy /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Make a new link" title="Make a new link (the old one stops working)" :disabled="isSaving" @click="reset"><RefreshCw /></Button>
    </div>
  </section>
</template>
