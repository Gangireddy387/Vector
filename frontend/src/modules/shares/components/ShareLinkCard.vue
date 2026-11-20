<script setup lang="ts">
import { Copy, Link2, RefreshCw } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { shareLinkUrl, sharesApi, type ShareLinkOptions, type ShareLinkState } from '../shares.api'

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
const passwordDraft = ref('')
const expiresLocal = ref('')
const guestComments = ref(false)
const locked = computed(() => !auth.hasFeature('publicShare'))
const link = computed(() => (share.value.token ? shareLinkUrl(share.value.token) : ''))

const copy = {
  board: {
    title: 'Public board',
    description: 'Anyone with the link can see this project’s board (read-only). Optional password and expiry.',
  },
  issue: {
    title: 'Public link',
    description: 'Anyone with the link can see this task. Optional password, expiry, and guest comments.',
  },
}[props.kind]

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string) {
  if (!value.trim()) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function syncFormFromShare() {
  passwordDraft.value = ''
  expiresLocal.value = toLocalInput(share.value.expiresAt)
  guestComments.value = Boolean(share.value.guestCommentsEnabled)
}

function optionsPayload(includePassword: boolean): ShareLinkOptions {
  const options: ShareLinkOptions = {
    expiresAt: fromLocalInput(expiresLocal.value),
  }
  if (props.kind === 'issue') options.guestCommentsEnabled = guestComments.value
  if (includePassword) {
    if (passwordDraft.value.trim()) options.password = passwordDraft.value.trim()
  }
  return options
}

async function load() {
  if (locked.value) {
    isLoading.value = false
    return
  }
  isLoading.value = true
  try {
    share.value = props.kind === 'board' ? await sharesApi.getBoardShare(props.targetId) : await sharesApi.getIssueShare(props.targetId)
    syncFormFromShare()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

async function save(enabled: boolean, reset = false, withOptions = false) {
  if (locked.value) return
  isSaving.value = true
  try {
    const options = withOptions || enabled ? optionsPayload(Boolean(passwordDraft.value.trim()) || reset) : {}
    share.value =
      props.kind === 'board'
        ? await sharesApi.setBoardShare(props.targetId, enabled, reset, options)
        : await sharesApi.setIssueShare(props.targetId, enabled, reset, options)
    syncFormFromShare()
    if (reset) toast.success('New share link ready', { description: 'The old link no longer works.' })
    else if (withOptions) toast.success('Share options saved')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

async function clearPassword() {
  if (locked.value || !share.value.enabled) return
  isSaving.value = true
  try {
    const options: ShareLinkOptions = {
      password: '',
      expiresAt: fromLocalInput(expiresLocal.value),
      ...(props.kind === 'issue' ? { guestCommentsEnabled: guestComments.value } : {}),
    }
    share.value =
      props.kind === 'board'
        ? await sharesApi.setBoardShare(props.targetId, true, false, options)
        : await sharesApi.setIssueShare(props.targetId, true, false, options)
    syncFormFromShare()
    toast.success('Password removed')
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
  if (ok) await save(true, true, true)
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
        @update:model-value="(value) => save(Boolean(value), false, Boolean(value))"
      />
    </div>
    <div v-if="share.enabled && link" class="space-y-3">
      <div class="flex items-center gap-1.5">
        <Input :model-value="link" readonly class="h-8 font-mono text-xs" @focus="($event.target as HTMLInputElement).select()" />
        <Button variant="outline" size="icon-sm" aria-label="Copy share link" @click="copyLink"><Copy /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Make a new link" title="Make a new link (the old one stops working)" :disabled="isSaving" @click="reset">
          <RefreshCw />
        </Button>
      </div>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="space-y-1">
          <Label class="text-xs text-muted-foreground">Password {{ share.hasPassword ? '(set)' : '(optional)' }}</Label>
          <div class="flex gap-1.5">
            <Input
              v-model="passwordDraft"
              type="password"
              autocomplete="new-password"
              class="h-8 text-xs"
              :placeholder="share.hasPassword ? 'Change password…' : 'Add password…'"
            />
            <Button v-if="share.hasPassword" type="button" variant="ghost" size="sm" class="h-8 shrink-0 px-2 text-xs" :disabled="isSaving" @click="clearPassword">
              Clear
            </Button>
          </div>
        </div>
        <div class="space-y-1">
          <Label class="text-xs text-muted-foreground">Expires (optional)</Label>
          <Input v-model="expiresLocal" type="datetime-local" class="h-8 text-xs" />
        </div>
      </div>
      <div v-if="kind === 'issue'" class="flex items-center justify-between gap-3 rounded-md border border-border/60 px-2.5 py-2">
        <div class="min-w-0">
          <p class="text-xs font-medium">Allow guest comments</p>
          <p class="text-[11px] text-muted-foreground">Visitors can leave a name + comment without signing in.</p>
        </div>
        <Switch v-model:model-value="guestComments" :disabled="isSaving" aria-label="Allow guest comments" />
      </div>
      <Button type="button" size="sm" variant="secondary" class="h-8" :disabled="isSaving" @click="save(true, false, true)">
        Save options
      </Button>
    </div>
  </section>
</template>
