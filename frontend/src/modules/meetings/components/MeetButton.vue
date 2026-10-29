<script setup lang="ts">
import { format, isToday, parseISO } from 'date-fns'
import { CalendarClock, CalendarPlus, ChevronDown, Video } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { getSocket } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type Meeting, meetingsApi } from '../meetings.api'
import { type MeetingPreset, useMeetingActions } from '../useMeetingActions'
import ScheduleMeetingSheet from './ScheduleMeetingSheet.vue'

/**
 * The video-call button on department, team, project and people pages: join the group's live meeting, see the next
 * one, or (for admins, department heads and team leads) start or schedule a meeting with these people.
 */
const props = withDefaults(defineProps<{ preset: MeetingPreset; compact?: boolean; size?: 'sm' | 'default' }>(), { compact: false, size: 'sm' })

const auth = useAuthStore()
const router = useRouter()
const { canSchedule, loadPermission, meetNow, startingKey } = useMeetingActions()
const meetings = ref<Meeting[]>([])
const sheetTarget = ref<{ preset: MeetingPreset } | null>(null)

const enabled = computed(() => auth.hasFeature('meetings'))
const live = computed(() => meetings.value.find((meeting) => meeting.status === 'live') ?? null)
const next = computed(() => meetings.value.find((meeting) => meeting.status === 'scheduled') ?? null)
const nextLabel = (meeting: Meeting) => {
  const startsAt = parseISO(meeting.startsAt)
  return isToday(startsAt) ? `Today ${format(startsAt, 'HH:mm')}` : format(startsAt, 'EEE d MMM, HH:mm')
}
const hasOthers = computed(() => props.preset.people.some((person) => person.id !== auth.user?.id))
const isStarting = computed(() => startingKey.value === props.preset.title)

async function loadMeetings() {
  const context = props.preset.context
  if (!enabled.value || !context) return
  meetings.value = await meetingsApi.list('upcoming', context).catch(() => [])
}

const open = (meeting: Meeting) => router.push({ name: 'meeting-room', params: { meetingId: meeting.id } })
const onChanged = () => void loadMeetings()

watch(() => props.preset.context?.id, loadMeetings)
onMounted(() => {
  if (!enabled.value) return
  void loadPermission()
  void loadMeetings()
  if (props.preset.context) getSocket()?.on('meeting:changed', onChanged)
})
onBeforeUnmount(() => getSocket()?.off('meeting:changed', onChanged))
</script>

<template>
  <template v-if="enabled">
    <Button v-if="live" :size="compact ? 'icon-sm' : size" class="bg-red-600 text-white hover:bg-red-600/90" :title="`Join “${live.title}”`" @click="open(live)">
      <span class="relative flex size-2"><span class="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75" /><span class="relative inline-flex size-2 rounded-full bg-white" /></span>
      <template v-if="!compact">Join meeting</template>
    </Button>

    <DropdownMenu v-else-if="canSchedule && hasOthers">
      <DropdownMenuTrigger as-child>
        <Button
          variant="outline"
          :size="compact ? 'icon-sm' : size"
          :loading="isStarting"
          :aria-label="`Video call: ${preset.title}`"
          :title="compact ? `Video call ${preset.title}` : undefined"
          :class="compact && 'text-primary'"
        >
          <Video />
          <template v-if="!compact">Meet <ChevronDown class="size-3.5 opacity-60" /></template>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" class="w-64">
        <DropdownMenuLabel class="truncate text-xs font-normal text-muted-foreground">{{ preset.title }}</DropdownMenuLabel>
        <DropdownMenuItem @select="meetNow(preset)"><Video /> Start a meeting now</DropdownMenuItem>
        <DropdownMenuItem @select="sheetTarget = { preset }"><CalendarPlus /> Schedule for later</DropdownMenuItem>
        <template v-if="next">
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="open(next)">
            <CalendarClock />
            <span class="min-w-0 flex-1">
              <span class="block truncate">{{ next.title }}</span>
              <span class="block text-xs text-muted-foreground">Next · {{ nextLabel(next) }}</span>
            </span>
          </DropdownMenuItem>
        </template>
      </DropdownMenuContent>
    </DropdownMenu>

    <Button v-else-if="next" variant="outline" :size="compact ? 'icon-sm' : size" :title="`Next meeting: ${next.title}`" @click="open(next)">
      <CalendarClock />
      <template v-if="!compact">Next meeting · {{ nextLabel(next) }}</template>
    </Button>

    <ScheduleMeetingSheet v-if="sheetTarget" v-model:target="sheetTarget" @saved="loadMeetings" />
  </template>
</template>
