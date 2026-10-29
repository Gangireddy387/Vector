<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { CalendarClock, Clock3, Ellipsis, History, Info, PencilLine, Plus, Radio, Trash2, Video, XCircle } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import ScheduleMeetingSheet from '../components/ScheduleMeetingSheet.vue'
import { BADGE_CLASSES, dayLabel, durationLabel, isJoinable, meetingBadge, timeRange } from '../meeting-format'
import { type Meeting, meetingsApi } from '../meetings.api'

const router = useRouter()
const confirm = useConfirm()
const { isDesktop } = useDevice()
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })

const scope = ref<'upcoming' | 'past'>('upcoming')
const meetings = ref<Meeting[]>([])
const isLoading = ref(true)
const canSchedule = ref(false)
const sheetTarget = ref<{ meeting?: Meeting } | null>(null)

async function load() {
  try {
    meetings.value = await meetingsApi.list(scope.value)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
}

watch(scope, () => {
  isLoading.value = true
  void load()
})

const live = computed(() => meetings.value.filter((meeting) => meeting.status === 'live'))
/** Upcoming meetings grouped by day; past ones newest first under their day. */
const groups = computed(() => {
  const rest = scope.value === 'upcoming' ? meetings.value.filter((meeting) => meeting.status !== 'live') : meetings.value
  const byDay = new Map<string, Meeting[]>()
  for (const meeting of rest) {
    const key = format(parseISO(meeting.startsAt), 'yyyy-MM-dd')
    byDay.set(key, [...(byDay.get(key) ?? []), meeting])
  }
  return [...byDay.entries()].map(([key, items]) => ({ key, label: dayLabel(items[0]!.startsAt), items }))
})

const peopleOf = (meeting: Meeting) => [...(meeting.host ? [meeting.host] : []), ...meeting.participants.filter((person) => person.id !== meeting.host?.id)]

const open = (meeting: Meeting) => router.push({ name: 'meeting-room', params: { meetingId: meeting.id } })

async function cancel(meeting: Meeting) {
  const ok = await confirm({
    title: 'Cancel this meeting?',
    description: `Everyone invited to “${meeting.title}” is told, and it leaves their calendars.`,
    confirmLabel: 'Cancel meeting',
    cancelLabel: 'Keep it',
    destructive: true,
  })
  if (!ok) return
  try {
    await meetingsApi.cancel(meeting.id)
    toast.success('Meeting cancelled')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(meeting: Meeting) {
  const ok = await confirm({
    title: 'Delete this meeting?',
    description: `“${meeting.title}” is removed for everyone, with its updates and notes. This cannot be undone.`,
    confirmLabel: 'Delete meeting',
    destructive: true,
  })
  if (!ok) return
  try {
    await meetingsApi.remove(meeting.id)
    meetings.value = meetings.value.filter((item) => item.id !== meeting.id)
    toast.success('Meeting deleted')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function onSaved() {
  scope.value = 'upcoming'
  void load()
}

const onChanged = () => void load()
onMounted(async () => {
  getSocket()?.on('meeting:changed', onChanged)
  canSchedule.value = await meetingsApi.canSchedule().catch(() => false)
  await load()
})
onBeforeUnmount(() => getSocket()?.off('meeting:changed', onChanged))
</script>

<template>
  <div class="w-full space-y-5" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader title="Meetings" description="Video calls right in the browser: join with a click, talk face to face and share your updates with the team.">
      <template #eyebrow>
        <span class="text-brand text-xs font-semibold tracking-wider uppercase">Meet & share updates</span>
      </template>
      <template #actions>
        <Button v-if="canSchedule" variant="brand" @click="sheetTarget = {}"><Plus /> Schedule meeting</Button>
      </template>
    </PageHeader>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="inline-flex border border-border/80 bg-muted/40 p-0.5" role="tablist">
        <button
          v-for="tab in [{ value: 'upcoming', label: 'Upcoming', icon: CalendarClock }, { value: 'past', label: 'Past', icon: History }] as const"
          :key="tab.value"
          type="button"
          role="tab"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors"
          :class="scope === tab.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="scope === tab.value"
          @click="scope = tab.value"
        >
          <component :is="tab.icon" class="size-4" /> {{ tab.label }}
        </button>
      </div>
      <p v-if="!canSchedule" class="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info class="size-3.5" /> Admins, department heads and team leads schedule meetings. The ones you are invited to show here.
      </p>
    </div>

    <div v-if="isLoading" class="space-y-3">
      <Skeleton v-for="index in 3" :key="index" class="h-28 w-full" />
    </div>

    <template v-else>
      <section v-if="scope === 'upcoming' && live.length" class="space-y-2">
        <h2 class="flex items-center gap-2 text-xs font-semibold tracking-wider text-red-600 uppercase dark:text-red-400">
          <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span class="relative inline-flex size-2 rounded-full bg-red-500" /></span>
          Live now
        </h2>
        <article
          v-for="meeting in live"
          :key="meeting.id"
          class="flex flex-col gap-4 border border-red-500/30 bg-gradient-to-r from-red-500/[0.07] to-transparent p-4 shadow-soft sm:flex-row sm:items-center"
        >
          <span class="flex size-12 shrink-0 items-center justify-center bg-red-500 text-white shadow-lg shadow-red-500/30"><Radio class="size-6" /></span>
          <div class="min-w-0 flex-1">
            <h3 class="truncate text-base font-semibold">{{ meeting.title }}</h3>
            <p class="mt-0.5 text-sm text-muted-foreground">
              {{ timeRange(meeting) }} · {{ meeting.inCall.length ? `${meeting.inCall.length} in the call` : 'Waiting for people' }}
            </p>
          </div>
          <UserAvatarStack :users="peopleOf(meeting).filter((person) => meeting.inCall.includes(person.id))" :max="5" />
          <Button variant="brand" class="bg-red-600 hover:bg-red-600/90" @click="open(meeting)"><Video /> Join now</Button>
        </article>
      </section>

      <section v-for="group in groups" :key="group.key" class="space-y-2">
        <h2 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{{ group.label }}</h2>
        <article
          v-for="meeting in group.items"
          :key="meeting.id"
          class="group flex cursor-pointer gap-4 border border-border/70 bg-card p-4 shadow-soft transition-colors hover:border-primary/40"
          :class="meeting.status === 'cancelled' && 'opacity-70'"
          @click="open(meeting)"
        >
          <div class="flex w-14 shrink-0 flex-col items-center justify-center border border-border/70 bg-muted/40 py-1.5">
            <span class="text-[10px] font-semibold tracking-wider text-brand uppercase">{{ format(parseISO(meeting.startsAt), 'MMM') }}</span>
            <span class="text-xl leading-tight font-semibold tabular-nums">{{ format(parseISO(meeting.startsAt), 'd') }}</span>
            <span class="text-[10px] text-muted-foreground">{{ format(parseISO(meeting.startsAt), 'EEE') }}</span>
          </div>

          <div class="min-w-0 flex-1 space-y-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="truncate text-[15px] font-semibold">{{ meeting.title }}</h3>
              <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="BADGE_CLASSES[meetingBadge(meeting, now).tone]">
                {{ meetingBadge(meeting, now).label }}
              </span>
            </div>
            <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span class="inline-flex items-center gap-1"><Clock3 class="size-3.5" /> {{ timeRange(meeting) }} · {{ durationLabel(meeting.durationMinutes) }}</span>
              <span v-if="meeting.host" class="inline-flex items-center gap-1.5"><UserAvatar :user="meeting.host" size="xs" /> Hosted by {{ meeting.host.name }}</span>
            </p>
            <p v-if="meeting.agenda" class="line-clamp-1 text-sm text-muted-foreground/90">{{ meeting.agenda }}</p>
          </div>

          <div class="flex shrink-0 flex-col items-end justify-between gap-2" @click.stop>
            <div class="flex items-center gap-1">
              <UserAvatarStack :users="peopleOf(meeting)" :max="4" />
              <DropdownMenu v-if="meeting.canManage && (scope === 'past' || isJoinable(meeting, now))">
                <DropdownMenuTrigger as-child>
                  <Button variant="ghost" size="icon-sm" aria-label="Meeting options"><Ellipsis /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem v-if="scope === 'past'" class="text-destructive focus:text-destructive" @select="remove(meeting)">
                    <Trash2 /> Delete meeting
                  </DropdownMenuItem>
                  <template v-else>
                    <DropdownMenuItem @select="sheetTarget = { meeting }"><PencilLine /> Edit meeting</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem class="text-destructive focus:text-destructive" @select="cancel(meeting)"><XCircle /> Cancel meeting</DropdownMenuItem>
                  </template>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button v-if="isJoinable(meeting, now)" size="sm" variant="outline" @click="open(meeting)"><Video /> Join</Button>
            <Button v-else size="sm" variant="ghost" @click="open(meeting)">Updates & notes</Button>
          </div>
        </article>
      </section>

      <EmptyState
        v-if="!groups.length && !(scope === 'upcoming' && live.length)"
        :icon="scope === 'upcoming' ? CalendarClock : History"
        :title="scope === 'upcoming' ? 'No meetings coming up' : 'No past meetings yet'"
        :description="
          scope === 'upcoming'
            ? canSchedule
              ? 'Schedule a stand-up or a review: invite people, and they join the video call from here.'
              : 'When someone invites you to a meeting, it shows up here and in your calendar.'
            : 'Meetings that ended, with their updates and notes, are kept here.'
        "
        class="border border-dashed border-border/80 py-14"
      >
        <Button v-if="canSchedule && scope === 'upcoming'" variant="brand" class="mt-4" @click="sheetTarget = {}"><Plus /> Schedule meeting</Button>
      </EmptyState>
    </template>

    <ScheduleMeetingSheet v-model:target="sheetTarget" @saved="onSaved" />
  </div>
</template>
