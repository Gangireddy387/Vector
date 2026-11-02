<script setup lang="ts">
import { CalendarCheck2, CalendarSync, CircleAlert, Unplug } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { type CalendarConnectionInfo, type CalendarProvider, calendarSyncApi } from '@/modules/meetings/meetings.api'

/**
 * Your Google or Microsoft 365 calendar, connected to Vector: meetings you host go there with the invited people,
 * their replies come back as RSVPs, and moving or cancelling the event there changes the meeting.
 */
const route = useRoute()
const router = useRouter()
const confirm = useConfirm()
const calendars = ref<CalendarConnectionInfo[] | null>(null)
const busy = ref<CalendarProvider | null>(null)

async function load() {
  try {
    calendars.value = await calendarSyncApi.list()
  } catch {
    calendars.value = []
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
  await load()
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
</script>

<template>
  <Card id="calendar">
    <CardHeader>
      <CardTitle class="flex items-center gap-2"><CalendarSync class="size-4" /> Connected calendars</CardTitle>
      <CardDescription>
        Meetings you host go to your calendar with everyone invited; their replies show in Vector, and moving or cancelling the event there changes the meeting.
      </CardDescription>
    </CardHeader>
    <CardContent class="space-y-2">
      <template v-if="!calendars">
        <Skeleton class="h-14 w-full" />
        <Skeleton class="h-14 w-full" />
      </template>
      <div v-for="item in calendars ?? []" :key="item.provider" class="flex flex-wrap items-center gap-3 border border-border/70 p-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-md"
          :class="item.connection && !item.connection.needsReconnect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'"
        >
          <CircleAlert v-if="item.connection?.needsReconnect" class="size-4 text-amber-600" />
          <CalendarCheck2 v-else class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">{{ item.label }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            <template v-if="!item.available">Not set up on this server yet. Ask your administrator.</template>
            <template v-else-if="item.connection?.needsReconnect">Access stopped working. Connect again to keep meetings in sync.</template>
            <template v-else-if="item.connection">Connected{{ item.connection.accountEmail ? ` as ${item.connection.accountEmail}` : '' }}</template>
            <template v-else>Not connected</template>
          </span>
        </span>
        <template v-if="item.available">
          <Button v-if="item.connection?.needsReconnect || !item.connection" size="sm" variant="outline" :loading="busy === item.provider" @click="connect(item.provider)">
            {{ item.connection ? 'Reconnect' : 'Connect' }}
          </Button>
          <Button v-if="item.connection" size="sm" variant="ghost" :disabled="busy === item.provider" @click="disconnect(item)"><Unplug /> Disconnect</Button>
        </template>
      </div>
    </CardContent>
  </Card>
</template>
