<script setup lang="ts">
import { addHours, format, isValid, setMinutes, setHours } from 'date-fns'
import { Copy, RefreshCw } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import { DateTimePicker } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useConfirm } from '@/composables/useConfirm'
import { todayInput } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { shareLinkUrl, sharesApi, type ShareLinkOptions, type ShareLinkState } from '../shares.api'

const props = defineProps<{
  kind: 'board' | 'issue'
  targetId: string
  /** Compact embed (e.g. dialog) without the settings Card chrome. */
  dense?: boolean
}>()

const auth = useAuthStore()
const confirm = useConfirm()
const share = ref<ShareLinkState>({ enabled: false, token: null })
const isLoading = ref(true)
const isSaving = ref(false)
const passwordDraft = ref('')
/** Local `YYYY-MM-DDTHH:mm` for DateTimePicker; empty = no expiry. */
const expiresLocal = ref('')
const guestComments = ref(false)
const locked = computed(() => !auth.hasFeature('publicShare'))
const link = computed(() => (share.value.token ? shareLinkUrl(share.value.token) : ''))
const today = todayInput()
const tick = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
/** Skip auto-save while hydrating from the server. */
let syncingForm = false

const isExpired = computed(() => {
  if (!share.value.expiresAt) return false
  const at = new Date(share.value.expiresAt).getTime()
  return Number.isFinite(at) && at <= tick.value
})

const savedExpiresLocal = computed(() => toExpiresLocal(share.value.expiresAt))
const expiresDirty = computed(() => expiresLocal.value !== savedExpiresLocal.value)
const optionsDirty = computed(
  () =>
    expiresDirty.value ||
    Boolean(passwordDraft.value.trim()) ||
    (props.kind === 'issue' && guestComments.value !== Boolean(share.value.guestCommentsEnabled)),
)

/** Draft expiry is in the future — ready to apply over a stale saved expiry. */
const draftIsFuture = computed(() => {
  const iso = expiresAtIso()
  return Boolean(iso && new Date(iso).getTime() > tick.value)
})

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

function toExpiresLocal(iso: string | null | undefined) {
  if (!iso) return ''
  const date = new Date(iso)
  if (!isValid(date)) return ''
  return format(date, "yyyy-MM-dd'T'HH:mm")
}

function expiresAtIso() {
  if (!expiresLocal.value.trim()) return null
  // Local wall time → ISO. Value is always `YYYY-MM-DDTHH:mm` from DateTimePicker.
  const raw = expiresLocal.value.length === 16 ? `${expiresLocal.value}:00` : expiresLocal.value
  const date = new Date(raw)
  if (!isValid(date)) return null
  return date.toISOString()
}

function syncFormFromShare() {
  syncingForm = true
  passwordDraft.value = ''
  expiresLocal.value = toExpiresLocal(share.value.expiresAt)
  guestComments.value = Boolean(share.value.guestCommentsEnabled)
  void nextTick(() => {
    syncingForm = false
  })
}

function optionsPayload(includePassword: boolean): ShareLinkOptions {
  const options: ShareLinkOptions = {
    expiresAt: expiresAtIso(),
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
  await nextTick()
  if (withOptions || enabled) {
    const iso = expiresAtIso()
    if (expiresDirty.value && expiresLocal.value.trim() && !iso) {
      toast.error('Pick a valid expiry date and time')
      return false
    }
    // Block only when the user is applying a *new* past time (draft), not when re-saving an already-expired link.
    if (expiresDirty.value && iso && new Date(iso).getTime() <= Date.now()) {
      toast.error('Expiry must be later than now', {
        description: 'Use “+1 hour” or “Tonight” below, or pick a future time.',
      })
      return false
    }
  }
  isSaving.value = true
  try {
    const options = withOptions || enabled ? optionsPayload(Boolean(passwordDraft.value.trim()) || reset) : {}
    share.value =
      props.kind === 'board'
        ? await sharesApi.setBoardShare(props.targetId, enabled, reset, options)
        : await sharesApi.setIssueShare(props.targetId, enabled, reset, options)
    syncFormFromShare()
    if (reset) toast.success('New share link ready', { description: 'The old link no longer works.' })
    else if (withOptions) {
      const saved = share.value.expiresAt
      toast.success('Share options saved', {
        description: saved ? `Link expires ${format(new Date(saved), 'd MMM yyyy · HH:mm')}` : 'No expiry set',
      })
    }
    return true
  } catch (error) {
    toast.error(getErrorMessage(error))
    return false
  } finally {
    isSaving.value = false
  }
}

/** Persist as soon as the picker commits so the field and banner stay in sync. */
async function onExpiresCommit() {
  if (syncingForm || locked.value || !share.value.enabled || isSaving.value) return
  if (!expiresDirty.value) return
  await save(true, false, true)
}

async function applyExpiry(localValue: string | null) {
  if (locked.value || !share.value.enabled || isSaving.value) return
  expiresLocal.value = localValue ?? ''
  await save(true, false, true)
}

async function extendByHours(hours: number) {
  await applyExpiry(format(addHours(new Date(), hours), "yyyy-MM-dd'T'HH:mm"))
}

async function extendTonight() {
  const tonight = setMinutes(setHours(new Date(), 23), 59)
  await applyExpiry(format(tonight, "yyyy-MM-dd'T'HH:mm"))
}

async function clearExpiry() {
  await applyExpiry(null)
}

async function clearPassword() {
  if (locked.value || !share.value.enabled) return
  isSaving.value = true
  try {
    const options: ShareLinkOptions = {
      password: '',
      expiresAt: expiresAtIso(),
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

onMounted(() => {
  void load()
  tickTimer = setInterval(() => {
    tick.value = Date.now()
  }, 1000)
})
watch(() => props.targetId, load)
onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<template>
  <Card :class="dense && 'border-0 bg-transparent py-0 shadow-none'">
    <CardHeader :class="dense && 'px-0'">
      <CardTitle>{{ copy.title }}</CardTitle>
      <CardDescription>
        <template v-if="locked">
          Public share links are on Pro and above.
          <RouterLink :to="{ name: 'org-plan' }" class="font-medium text-foreground underline-offset-2 hover:underline">See your plan</RouterLink>
        </template>
        <template v-else>{{ copy.description }}</template>
      </CardDescription>
      <CardAction>
        <Switch
          :model-value="share.enabled"
          :disabled="isSaving || isLoading || locked"
          :aria-label="kind === 'board' ? 'Share board publicly' : 'Share task publicly'"
          @update:model-value="(value) => save(Boolean(value), false, Boolean(value))"
        />
      </CardAction>
    </CardHeader>

    <CardContent v-if="share.enabled && link" class="space-y-4" :class="dense && 'px-0'">
      <!-- Pending draft takes priority so the old “expired at …” banner doesn’t stick while editing. -->
      <div
        v-if="expiresDirty && draftIsFuture"
        class="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
        role="status"
      >
        <p class="text-xs text-amber-950 dark:text-amber-50">
          New expiry {{ format(new Date(`${expiresLocal}:00`), 'd MMM yyyy · HH:mm') }} isn’t saved yet
          <template v-if="isExpired">
            (link still expired at {{ format(new Date(share.expiresAt!), 'd MMM yyyy · HH:mm') }} until you save).
          </template>
        </p>
        <Button type="button" size="sm" class="h-8" :disabled="isSaving" :loading="isSaving" @click="save(true, false, true)">
          Save new expiry
        </Button>
      </div>
      <div
        v-else-if="isExpired"
        class="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5"
        role="status"
      >
        <p class="text-xs text-destructive">
          This link expired at {{ format(new Date(share.expiresAt!), 'd MMM yyyy · HH:mm') }}. Visitors see “unavailable” until you extend it.
        </p>
        <div class="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" class="h-8 border-destructive/30 bg-background" :disabled="isSaving" @click="extendByHours(1)">
            +1 hour
          </Button>
          <Button type="button" size="sm" variant="outline" class="h-8 border-destructive/30 bg-background" :disabled="isSaving" @click="extendTonight">
            Tonight
          </Button>
          <Button type="button" size="sm" variant="outline" class="h-8 border-destructive/30 bg-background" :disabled="isSaving" @click="clearExpiry">
            No expiry
          </Button>
        </div>
      </div>
      <p
        v-else-if="expiresDirty && !isSaving"
        class="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100"
        role="status"
      >
        New expiry isn’t applied yet — pick a time later than now, or use Save options.
      </p>
      <div class="flex items-center gap-2">
        <div class="relative min-w-0 flex-1">
          <Input
            :model-value="link"
            readonly
            class="h-9 w-full pr-9 font-mono text-[13px]"
            aria-label="Share link"
            @focus="($event.target as HTMLInputElement).select()"
          />
          <button
            type="button"
            class="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Copy share link"
            @click="copyLink"
          >
            <Copy class="size-3.5" />
          </button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          class="size-9 shrink-0"
          aria-label="Make a new link"
          title="Make a new link (the old one stops working)"
          :disabled="isSaving"
          @click="reset"
        >
          <RefreshCw class="size-4" />
        </Button>
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <FormField :label="share.hasPassword ? 'Password (set)' : 'Password'" for="share-password" optional>
          <div class="flex gap-2">
            <Input
              id="share-password"
              v-model="passwordDraft"
              type="password"
              autocomplete="new-password"
              class="h-9 min-w-0 flex-1"
              :placeholder="share.hasPassword ? 'Change password…' : 'Add password…'"
            />
            <Button
              v-if="share.hasPassword"
              type="button"
              variant="outline"
              size="sm"
              class="h-9 shrink-0"
              :disabled="isSaving"
              @click="clearPassword"
            >
              Clear
            </Button>
          </div>
        </FormField>

        <FormField
          label="Expires"
          for="share-expires"
          optional
          :hint="
            isExpired && !expiresDirty
              ? 'Expired — use +1 hour / Tonight above, or pick a later time.'
              : expiresDirty && draftIsFuture
                ? 'Click Save new expiry above to apply.'
                : expiresDirty
                  ? 'That time is already past — pick a later one.'
                  : 'Pick a day and time. The link stops working at that moment.'
          "
        >
          <DateTimePicker
            id="share-expires"
            v-model="expiresLocal"
            class="w-full"
            placeholder="No expiry"
            default-time="23:59"
            :min="today"
            aria-label="Expiry date and time"
            @change="onExpiresCommit"
          />
        </FormField>
      </div>

      <div
        v-if="kind === 'issue'"
        class="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3.5 py-3"
      >
        <div class="min-w-0">
          <p class="text-sm font-medium">Allow guest comments</p>
          <p class="text-xs text-muted-foreground">Visitors can leave a name and comment without signing in.</p>
        </div>
        <Switch v-model:model-value="guestComments" :disabled="isSaving" aria-label="Allow guest comments" />
      </div>

      <Button type="button" size="sm" :disabled="isSaving || !optionsDirty" :loading="isSaving" @click="save(true, false, true)">
        {{ optionsDirty ? 'Save options' : 'Saved' }}
      </Button>
    </CardContent>
  </Card>
</template>
