<script setup lang="ts">
import { Copy, Link2, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { shareLinkUrl, sharesApi, type ShareLinkState } from '../shares.api'

const props = defineProps<{
  kind: 'board' | 'issue'
  targetId: string
  /** Compact section (settings) vs dialog-friendly. */
  dense?: boolean
}>()

const auth = useAuthStore()
const confirm = useConfirm()
const share = ref<ShareLinkState>({ enabled: false, token: null })
const isLoading = ref(true)
const isSaving = ref(false)
const locked = computed(() => !auth.hasFeature('publicShare'))
const link = computed(() => (share.value.token ? shareLinkUrl(share.value.token) : ''))

const copy = {
  board: {
    title: 'Public board',
    description: 'Anyone with the link can see this project’s board (read-only). No Vector account needed.',
  },
  issue: {
    title: 'Public link',
    description: 'Anyone with the link can see this task (read-only). No Vector account needed.',
  },
}[props.kind]

async function load() {
  if (locked.value) {
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    share.value = props.kind === 'board' ? await sharesApi.getBoardShare(props.targetId) : await sharesApi.getIssueShare(props.targetId)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

async function save(enabled: boolean, reset = false) {
  if (locked.value) return
  isSaving.value = true
  try {
    share.value =
      props.kind === 'board'
        ? await sharesApi.setBoardShare(props.targetId, enabled, reset)
        : await sharesApi.setIssueShare(props.targetId, enabled, reset)
    if (reset) toast.success('New share link ready', { description: 'The old link no longer works.' })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(link.value)
    toast.success('Share link copied')
  } catch {
    toast.error('Copy the link from the box instead')
  }
}

async function reset() {
  const ok = await confirm({
    title: 'Make a new share link?',
    description: 'The current link stops working. Send the new one to people who need access.',
    confirmLabel: 'New link',
  })
  if (ok) await save(true, true)
}

onMounted(load)
watch(() => props.targetId, load)
</script>

<template>
  <section class="space-y-2.5 border border-border/70 bg-card p-3" :class="dense && 'p-3'">
    <div class="flex items-start gap-3">
      <span class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><Link2 class="size-4" /></span>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold">{{ copy.title }}</p>
        <p class="text-xs text-muted-foreground">
          <template v-if="locked">
            Public share links are on Pro and above.
            <RouterLink :to="{ name: 'org-plan' }" class="font-medium text-foreground underline-offset-2 hover:underline">See your plan</RouterLink>
          </template>
          <template v-else>{{ copy.description }}</template>
        </p>
      </div>
      <Switch
        :model-value="share.enabled"
        :disabled="isSaving || isLoading || locked"
        :aria-label="kind === 'board' ? 'Share board publicly' : 'Share task publicly'"
        @update:model-value="(value) => save(Boolean(value))"
      />
    </div>
    <div v-if="share.enabled && link" class="flex items-center gap-1.5">
      <Input :model-value="link" readonly class="h-8 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
      <Button variant="outline" size="icon-sm" aria-label="Copy share link" @click="copyLink"><Copy /></Button>
      <Button variant="ghost" size="icon-sm" aria-label="Make a new link" title="Make a new link (the old one stops working)" :disabled="isSaving" @click="reset">
        <RefreshCw />
      </Button>
    </div>
  </section>
</template>
