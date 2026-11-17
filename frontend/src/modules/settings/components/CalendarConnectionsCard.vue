<script setup lang="ts">
import { CalendarCheck2, CalendarSync, CircleAlert, Sparkles, Unplug } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useAuthStore } from '@/modules/auth/auth.store'
import { aiApi } from '@/modules/issues/api/ai.api'
import { type CalendarConnectionInfo, type CalendarProvider, calendarSyncApi } from '@/modules/meetings/meetings.api'

/**
 * Your Google or Microsoft 365 calendar, connected to Vector: meetings you host go there with the invited people,
 * their replies come back as RSVPs, and moving or cancelling the event there changes the meeting.
 */
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const confirm = useConfirm()
const calendars = ref<CalendarConnectionInfo[] | null>(null)
const loadError = ref<string | null>(null)
const busy = ref<CalendarProvider | null>(null)
const aiStatus = ref<{ enabled: boolean; provider: 'openai' | 'heuristic' } | null>(null)

const statusLabel = computed(() => {
  if (!aiStatus.value) return null
  if (!aiStatus.value.enabled) return { text: 'AI assistant off for this plan', tone: 'muted' as const }
  if (aiStatus.value.provider === 'openai') return { text: 'AI: OpenAI connected', tone: 'ok' as const }
  return { text: 'AI: smart fallback (no OpenAI key on server)', tone: 'warn' as const }
})

async function load() {
  loadError.value = null
  try {
    calendars.value = await calendarSyncApi.list()
  } catch (error) {
    calendars.value = null
    loadError.value = getErrorMessage(error)
  }
}

async function loadAiStatus() {
  if (!auth.hasFeature('aiAssistant')) return
  try {
    aiStatus.value = await aiApi.status()
  } catch {
    aiStatus.value = null
  }
}

const RESULTS: Record<string, { ok: boolean; message: string }> = {
  connected: { ok: true, message: 'Calendar connected. Meetings you host now go to it.' },
  denied: { ok: false, message: 'The calendar was not connected: access was not allowed.' },
  expired: { ok: false, message: 'That took too long. Connect the calendar again.' },
  error: { ok: false, message: 'The calendar could not be connected. Try again.' },
}

onMounted(async () => {
  const result = RESULTS[String(route.query.calendar ?? '')]
  if (result) {
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
    void router.replace({ query: { ...route.query, calendar: undefined, provider: undefined }, hash: route.hash })
  }
  await Promise.all([load(), loadAiStatus()])
})
useSocketEvents({ 'calendar:connections': () => void load() })

async function connect(provider: CalendarProvider) {
  busy.value = provider
  try {
    window.location.assign(await calendarSyncApi.connect(provider))
  } catch (error) {
    toast.error(getErrorMessage(error))
    busy.value = null
  }
}

async function disconnect(item: CalendarConnectionInfo) {
  const ok = await confirm({
    title: `Disconnect ${item.label}?`,
    description: 'Meetings already on it stay there, but stop following changes. New meetings go out by email again.',
    confirmLabel: 'Disconnect',
    destructive: true,
  })
  if (!ok) return
  busy.value = item.provider
  try {
    await calendarSyncApi.disconnect(item.provider)
    toast.success(`${item.label} disconnected`)
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = null
  }
}

function connectionSubtitle(item: CalendarConnectionInfo) {
  if (!item.available) return 'Not configured on this server — an admin must set Google/Microsoft OAuth env vars.'
  const connection = item.connection
  if (!connection) return 'Not connected'
  if (connection.needsReconnect) return 'Access stopped working. Reconnect to keep meetings in sync.'
  const email = connection.accountEmail ? ` as ${connection.accountEmail}` : ''
  const sync = connection.lastSyncedAt
    ? ` · last sync ${timeAgo(connection.lastSyncedAt)}`
    : ' · never synced a meeting yet'
  return `Connected${email}${sync}`
}
</script>

<template>
  <Card id="calendar" class="gap-3">
    <CardHeader class="border-b border-border/60 pb-3">
      <CardTitle class="flex items-center gap-2"><CalendarSync class="size-4" /> Connected calendars</CardTitle>
      <CardDescription>
        Meetings you host go to your calendar with everyone invited; their replies show in Vector, and moving or cancelling the event there changes the meeting.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2.5">
      <template v-if="calendars === null && !loadError">
        <Skeleton class="h-14 w-full rounded-xl" />
        <Skeleton class="h-14 w-full rounded-xl" />
      </template>
      <EmptyState
        v-else-if="loadError"
        :icon="CalendarSync"
        title="Calendars did not load"
        :description="loadError"
        class="py-8"
      >
        <Button variant="outline" @click="load">Try again</Button>
      </EmptyState>
      <div
        v-for="item in calendars ?? []"
        :key="item.provider"
        class="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/15 p-3.5 transition-colors hover:bg-muted/30"
      >
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-lg"
          :class="
            !item.available
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
              : item.connection && !item.connection.needsReconnect
                ? 'bg-emerald-500/10 text-emerald-600'
                : item.connection?.needsReconnect
                  ? 'bg-amber-500/10 text-amber-700'
                  : 'bg-muted text-muted-foreground'
          "
        >
          <CircleAlert v-if="!item.available || item.connection?.needsReconnect" class="size-4" />
          <CalendarCheck2 v-else class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex flex-wrap items-center gap-2">
            <span class="text-sm font-medium">{{ item.label }}</span>
            <Badge v-if="!item.available" variant="outline" class="border-amber-500/40 text-amber-800 dark:text-amber-300">Not configured</Badge>
            <Badge v-else-if="item.connection?.needsReconnect" variant="outline" class="border-amber-500/40 text-amber-800 dark:text-amber-300">Needs reconnect</Badge>
            <Badge v-else-if="item.connection" variant="success">Connected</Badge>
            <Badge v-else variant="outline">Not connected</Badge>
          </span>
          <span class="mt-0.5 block truncate text-xs text-muted-foreground">{{ connectionSubtitle(item) }}</span>
        </span>
        <template v-if="item.available">
          <Button
            v-if="item.connection?.needsReconnect || !item.connection"
            size="sm"
            :variant="item.connection?.needsReconnect ? 'default' : 'outline'"
            :loading="busy === item.provider"
            @click="connect(item.provider)"
          >
            {{ item.connection ? 'Reconnect' : 'Connect' }}
          </Button>
          <Button v-if="item.connection" size="sm" variant="ghost" :disabled="busy === item.provider" @click="disconnect(item)"><Unplug /> Disconnect</Button>
        </template>
      </div>

      <div class="rounded-xl border border-border/70 bg-muted/20 px-3.5 py-3 text-xs text-muted-foreground">
        <p class="flex items-start gap-2">
          <Sparkles class="mt-0.5 size-3.5 shrink-0" />
          <span class="min-w-0">
            <span class="font-medium text-foreground">{{ statusLabel?.text ?? 'AI status unavailable' }}</span>
            <span class="mt-0.5 block">Email digests and automation emails need a mail provider (e.g. SendGrid) on the server. Calendar OAuth needs Google/Microsoft client IDs in the backend env.</span>
          </span>
        </p>
      </div>
    </CardContent>
  </Card>
</template>
