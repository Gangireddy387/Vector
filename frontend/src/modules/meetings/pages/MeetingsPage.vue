<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { CalendarClock, CalendarX2, Clock3, Ellipsis, History, Info, Link2, ListTodo, PencilLine, Plus, Radio, Repeat, Trash2, Video, XCircle } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
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
import { useSocketEvents } from '@/lib/socket-events'
import MeetingSearch from '../components/MeetingSearch.vue'
import PushPrompt from '../components/PushPrompt.vue'
import ScheduleMeetingSheet from '../components/ScheduleMeetingSheet.vue'
import { BADGE_CLASSES, dayLabel, durationLabel, isJoinable, meetingBadge, recurrenceLabel, timeRange } from '../meeting-format'
import { type Meeting, meetingsApi } from '../meetings.api'

const router = useRouter()
const confirm = useConfirm()
const { isDesktop } = useDevice()
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })

const scope = ref<'upcoming' | 'past'>('upcoming')
const meetings = ref<Meeting[]>([])
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const canSchedule = ref(false)
const sheetTarget = ref<{ meeting?: Meeting } | null>(null)
/** While searching, the results replace the list. */
const searchQuery = ref('')
const searching = computed(() => searchQuery.value.trim().length >= 2)

async function load() {
  loadError.value = null
  try {
    meetings.value = await meetingsApi.list(scope.value)
  } catch (error) {
    loadError.value = getErrorMessage(error)
    if (meetings.value.length) toast.error(loadError.value)
  } finally {
    isLoading.value = false
  }
}

watch(scope, () => {
  isLoading.value = true
  meetings.value = []
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
const openActionCount = (meeting: Meeting) => (meeting.summary?.actionItems ?? []).filter((item) => item.text && !item.issue).length

const open = (meeting: Meeting) => router.push({ name: 'meeting-room', params: { meetingId: meeting.id } })

/** `series`: cancel this and every later occurrence of a repeating meeting, and stop repeating it. */
async function cancel(meeting: Meeting, series = false) {
  const ok = await confirm(
    series
      ? {
          title: 'Stop this repeating meeting?',
          description: `This and every later “${meeting.title}” are cancelled and leave everyone’s calendars. Past ones keep their notes.`,
          confirmLabel: 'Cancel all upcoming',
          cancelLabel: 'Keep them',
          destructive: true,
        }
      : {
          title: meeting.recurrence ? 'Skip this meeting?' : 'Cancel this meeting?',
          description: meeting.recurrence
            ? `Only this “${meeting.title}” is cancelled; the next one stays on everyone’s calendar.`
            : `Everyone invited to “${meeting.title}” is told, and it leaves their calendars.`,
          confirmLabel: 'Cancel meeting',
          cancelLabel: 'Keep it',
          destructive: true,
        },
  )
  if (!ok) return
  try {
    await meetingsApi.cancel(meeting.id, series)
    toast.success(series ? 'The repeating meeting was stopped' : 'Meeting cancelled')
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

useSocketEvents({ 'meeting:changed': () => void load() })
onMounted(async () => {
  canSchedule.value = await meetingsApi.canSchedule().catch(() => false)
  await load()
})
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3 pb-2'">
    <PageHeader title="Meetings" description="Video calls right in the browser: join with a click, talk face to face and share your updates with the team.">
      <template #actions>
        <Button v-if="canSchedule" variant="brand" class="max-sm:w-full" @click="sheetTarget = {}"><Plus /> Schedule meeting</Button>
      </template>
    </PageHeader>

    <div class="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <div class="inline-flex h-9 w-full items-center rounded-lg bg-muted p-0.5 sm:h-8 sm:w-auto" role="tablist">
        <button
          v-for="tab in [{ value: 'upcoming', label: 'Upcoming', icon: CalendarClock }, { value: 'past', label: 'Past', icon: History }] as const"
          :key="tab.value"
          type="button"
          role="tab"
          class="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors sm:h-7 sm:flex-none"
          :class="scope === tab.value ? 'bg-card text-foreground shadow-[0_0_0_1px_var(--border)]' : 'text-muted-foreground hover:text-foreground'"
          :aria-selected="scope === tab.value"
          @click="scope = tab.value"
        >
          <component :is="tab.icon" class="size-3.5" /> {{ tab.label }}
        </button>
      </div>
      <p v-if="!canSchedule" class="flex items-start gap-1.5 text-[12px] leading-snug text-muted-foreground sm:items-center sm:text-xs">
        <Info class="mt-0.5 size-3.5 shrink-0 sm:mt-0" />
        <span class="sm:hidden">Leads schedule meetings; invites show up here.</span>
        <span class="max-sm:hidden">Admins, department heads and team leads schedule meetings. The ones you are invited to show here.</span>
      </p>
    </div>

    <MeetingSearch v-model="searchQuery" />

    <PushPrompt />

    <template v-if="!searching">
      <div v-if="isLoading" class="space-y-3">
        <Skeleton v-for="index in 3" :key="index" class="h-28 w-full rounded-xl" />
      </div>

      <EmptyState
        v-else-if="loadError && !meetings.length"
        :icon="CalendarClock"
        title="Meetings did not load"
        :description="loadError"
        class="py-16"
      >
        <Button variant="outline" class="mt-1 max-sm:w-full" @click="isLoading = true; load()">Try again</Button>
      </EmptyState>

      <template v-else>
        <section v-if="scope === 'upcoming' && live.length" class="space-y-2">
          <h2 class="flex items-center gap-2 text-xs font-medium text-red-600 dark:text-red-400">
            <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" /><span class="relative inline-flex size-2 rounded-full bg-red-500" /></span>
            Live now
          </h2>
          <article
            v-for="meeting in live"
            :key="meeting.id"
            class="flex flex-col gap-3 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/[0.07] to-transparent p-3.5 shadow-soft sm:flex-row sm:items-center sm:gap-4 sm:p-4"
          >
            <span class="flex size-11 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white shadow-lg shadow-red-500/30 sm:size-12"><Radio class="size-5 sm:size-6" /></span>
            <div class="min-w-0 flex-1">
              <h3 class="truncate text-base font-semibold">{{ meeting.title }}</h3>
              <p class="mt-0.5 text-sm text-muted-foreground">
                {{ timeRange(meeting) }} · {{ meeting.inCall.length ? `${meeting.inCall.length} in the call` : 'Waiting for people' }}
              </p>
            </div>
            <UserAvatarStack :users="peopleOf(meeting).filter((person) => meeting.inCall.includes(person.id))" :max="5" />
            <Button variant="brand" class="max-sm:w-full bg-red-600 hover:bg-red-600/90" @click="open(meeting)"><Video /> Join now</Button>
          </article>
        </section>

        <section v-for="group in groups" :key="group.key" class="space-y-2">
          <h2 class="text-xs font-medium text-muted-foreground">{{ group.label }}</h2>
          <article
            v-for="meeting in group.items"
            :key="meeting.id"
            class="group flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-soft transition-colors hover:border-input sm:flex-row sm:items-stretch sm:gap-4 sm:p-4"
            :class="meeting.status === 'cancelled' && 'opacity-70'"
            @click="open(meeting)"
          >
            <div class="flex min-w-0 flex-1 gap-3">
              <div class="flex w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-muted/50 py-1.5 sm:w-14">
                <span class="text-[10px] font-medium text-brand sm:text-xs">{{ format(parseISO(meeting.startsAt), 'MMM') }}</span>
                <span class="text-lg leading-tight font-semibold tabular-nums sm:text-xl">{{ format(parseISO(meeting.startsAt), 'd') }}</span>
                <span class="text-[10px] text-muted-foreground">{{ format(parseISO(meeting.startsAt), 'EEE') }}</span>
              </div>

              <div class="min-w-0 flex-1 space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h3 class="truncate text-[15px] font-semibold">{{ meeting.title }}</h3>
                  <span class="rounded-full px-2 py-0.5 text-[11px] font-medium" :class="BADGE_CLASSES[meetingBadge(meeting, now).tone]">
                    {{ meetingBadge(meeting, now).label }}
                  </span>
                </div>
                <p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  <span class="inline-flex items-center gap-1"><Clock3 class="size-3.5" /> {{ timeRange(meeting) }} · {{ durationLabel(meeting.durationMinutes) }}</span>
                  <span v-if="meeting.host" class="inline-flex items-center gap-1.5 max-sm:hidden"><UserAvatar :user="meeting.host" size="xs" /> Hosted by {{ meeting.host.name }}</span>
                  <span v-if="meeting.recurrence" class="inline-flex items-center gap-1"><Repeat class="size-3.5" /> {{ recurrenceLabel(meeting.recurrence, meeting.startsAt) }}</span>
                  <span v-if="meeting.guestAccess" class="inline-flex items-center gap-1 max-sm:hidden"><Link2 class="size-3.5" /> Guests can join</span>
                </p>
                <p v-if="meeting.agenda" class="line-clamp-1 text-sm text-muted-foreground/90 max-sm:hidden">{{ meeting.agenda }}</p>
              </div>
            </div>

            <div class="flex w-full shrink-0 flex-row flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 sm:w-auto sm:flex-col sm:items-end sm:border-0 sm:pt-0" @click.stop>
              <div class="flex min-w-0 items-center gap-1">
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
                      <DropdownMenuItem class="text-destructive focus:text-destructive" @select="cancel(meeting)">
                        <XCircle /> {{ meeting.recurrence ? 'Cancel this one' : 'Cancel meeting' }}
                      </DropdownMenuItem>
                      <DropdownMenuItem v-if="meeting.recurrence" class="text-destructive focus:text-destructive" @select="cancel(meeting, true)">
                        <CalendarX2 /> Cancel all upcoming
                      </DropdownMenuItem>
                    </template>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button v-if="isJoinable(meeting, now)" size="sm" variant="outline" class="max-sm:min-w-[5.5rem]" @click="open(meeting)"><Video /> Join</Button>
              <Button v-else-if="scope === 'past' && openActionCount(meeting)" size="sm" variant="outline" class="max-sm:min-w-[5.5rem]" @click="open(meeting)">
                <ListTodo /> {{ openActionCount(meeting) }} to tasks
              </Button>
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
          class="py-14 sm:py-16"
        >
          <Button v-if="canSchedule && scope === 'upcoming'" variant="brand" class="mt-2 max-sm:w-full" @click="sheetTarget = {}"><Plus /> Schedule meeting</Button>
        </EmptyState>
      </template>
    </template>

    <ScheduleMeetingSheet v-model:target="sheetTarget" @saved="onSaved" />
  </div>
</template>
