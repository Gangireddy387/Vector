<script setup lang="ts">
import { addDays, format, isValid, parseISO } from 'date-fns'
import { ArrowRight, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, ClipboardCopy, ClipboardList, Clock3, Columns3, ListTodo, Users } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { DatePicker } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { formatDate, todayInput, toDateInput } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import StandupEditor from '../components/StandupEditor.vue'
import StandupMemberCard from '../components/StandupMemberCard.vue'
import { type StandupDay, standupApi } from '../standup.api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const projects = useProjectsStore()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value] ?? null)
const canPost = computed(() => project.value?.myRole === 'admin' || project.value?.myRole === 'member')

const today = todayInput()
/** The day lives in the URL so a standup can be linked from chat, notifications and the record. */
const date = computed({
  get: () => {
    const value = typeof route.query.date === 'string' ? route.query.date : ''
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parseISO(value)) && value <= today ? value : today
  },
  set: (value: string) => void router.replace({ query: value === today ? {} : { date: value } }),
})
const shift = (days: number) => {
  const next = toDateInput(addDays(parseISO(date.value), days))
  if (next <= today) date.value = next
}

const day = ref<StandupDay | null>(null)
const isLoading = ref(true)
const errorMessage = ref('')
const editing = ref(false)

async function load() {
  errorMessage.value = ''
  try {
    day.value = await standupApi.day(projectId.value, date.value)
  } catch (error) {
    errorMessage.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
}
watch([projectId, date], () => {
  editing.value = false
  isLoading.value = !day.value
  void load()
}, { immediate: true })

useProjectRealtime(projectId, load)
const onStandupChanged = (payload: { date: string; projectId?: string }) =>
  payload.date === date.value && (!payload.projectId || payload.projectId === projectId.value) && void load()
useSocketEvents({ 'standup:changed': onStandupChanged })

const me = computed(() => day.value?.members.find((member) => member.user.id === auth.user?.id) ?? null)
const showEditor = computed(() => canPost.value && (editing.value || !me.value?.update))
/** After today’s post, push the next step in the workday loop. */
const showHandoff = computed(() => date.value === today && Boolean(me.value?.update) && !editing.value)
const teammates = computed(() => (day.value?.members ?? []).filter((member) => member.user.id !== auth.user?.id || !showEditor.value))
const issueKeys = computed(() => Object.keys(day.value?.issues ?? {}))
const recentDays = computed(() => {
  const counts = new Map((day.value?.recentDays ?? []).map((row) => [row.date, row.count]))
  return Array.from({ length: 10 }, (_, index) => toDateInput(addDays(parseISO(today), -index)))
    .filter((value) => {
      const weekday = parseISO(value).getDay()
      return (weekday !== 0 && weekday !== 6) || counts.has(value)
    })
    .slice(0, 7)
    .map((value) => ({ date: value, count: counts.get(value) ?? 0 }))
})

const dateTitle = computed(() => (date.value === today ? 'Today' : format(parseISO(date.value), 'EEEE')))
const ritualLabel = computed(() => {
  const ritual = day.value?.ritual
  if (!ritual?.enabled) return null
  const pad = (hour: number) => `${String(hour).padStart(2, '0')}:00`
  return `Window ${pad(ritual.reminderHour)} → digest ${pad(ritual.digestHour)} (each person’s local time)`
})
const missingNames = computed(() => (day.value?.members ?? []).filter((row) => !row.update).map((row) => row.user.name))

async function copySummary() {
  if (!day.value) return
  const strip = (text: string) => text.trim()
  const lines = [`Standup · ${project.value?.name ?? ''} · ${formatDate(date.value, 'EEE, d MMM yyyy')}`, `${day.value.stats.posted} of ${day.value.stats.expected} posted`, '']
  for (const member of day.value.members.filter((row) => row.update)) {
    const update = member.update!
    lines.push(member.user.name)
    if (update.yesterday) lines.push(`Since ${formatDate(day.value.previousDate, 'EEE')}:`, strip(update.yesterday))
    if (update.today) lines.push('Today:', strip(update.today))
    if (update.blockers) lines.push('Blockers:', strip(update.blockers))
    lines.push('')
  }
  const missing = day.value.members.filter((row) => !row.update).map((row) => row.user.name)
  if (missing.length) lines.push(`Not posted yet: ${missing.join(', ')}`)
  try {
    await navigator.clipboard.writeText(lines.join('\n').trim())
    toast.success('Standup summary copied', { description: 'Paste it into a meeting note, email or chat.' })
  } catch {
    toast.error('Could not copy to the clipboard')
  }
}
</script>

<template>
  <div class="min-h-0 w-full flex-1 space-y-4 overflow-y-auto sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <!-- Day navigation -->
    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div class="flex min-w-0 flex-wrap items-center gap-1">
        <Button variant="outline" size="icon-sm" aria-label="Previous day" @click="shift(-1)"><ChevronLeft /></Button>
        <DatePicker
          :model-value="date"
          size="sm"
          class="min-w-0 flex-1 sm:w-48 sm:flex-none"
          :clearable="false"
          :presets="false"
          display-format="EEE, d MMM yyyy"
          aria-label="Standup day"
          @update:model-value="(value) => value && value <= today && (date = value)"
        />
        <Button variant="outline" size="icon-sm" aria-label="Next day" :disabled="date >= today" @click="shift(1)"><ChevronRight /></Button>
        <Button v-if="date !== today" variant="ghost" size="sm" @click="date = today">Today</Button>
      </div>
      <div class="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 scrollbar-none sm:flex-wrap sm:overflow-visible" aria-label="Recent standups">
        <button
          v-for="entry in recentDays"
          :key="entry.date"
          type="button"
          class="flex shrink-0 flex-col items-center rounded-lg border px-2.5 py-1.5 text-[11px] leading-tight transition-colors"
          :class="entry.date === date ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted'"
          :title="`${formatDate(entry.date, 'EEE, d MMM')}: ${entry.count} update${entry.count === 1 ? '' : 's'}`"
          @click="date = entry.date"
        >
          <span class="font-semibold">{{ formatDate(entry.date, 'EEE') }}</span>
          <span class="flex items-center gap-1 tabular-nums">
            {{ formatDate(entry.date, 'd') }}
            <span class="size-1.5 rounded-full" :class="entry.count ? 'bg-success' : 'bg-muted-foreground/30'" />
          </span>
        </button>
      </div>
      <Button variant="outline" size="sm" class="max-sm:w-full sm:ml-auto" :disabled="!day?.stats.posted" @click="copySummary"><ClipboardCopy /> Copy summary</Button>
    </div>

    <p v-if="errorMessage" class="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

    <div v-if="isLoading" class="space-y-4">
      <Skeleton class="h-20 w-full" />
      <Skeleton class="h-56 w-full" />
    </div>

    <template v-else-if="day">
      <!-- At a glance -->
      <section class="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 shadow-soft sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-8 sm:gap-y-3">
        <div class="min-w-0">
          <h1 class="text-base font-semibold">{{ dateTitle }}'s standup</h1>
          <p class="text-xs text-muted-foreground">{{ formatDate(date, 'd MMMM yyyy') }} · covers work since {{ formatDate(day.previousDate, 'EEEE d MMM') }}</p>
          <p v-if="ritualLabel" class="mt-1 flex items-center gap-1.5 text-[11.5px] text-muted-foreground"><Clock3 class="size-3.5" /> {{ ritualLabel }}</p>
        </div>
        <div class="flex min-w-0 w-full items-center gap-3 sm:min-w-48 sm:w-auto sm:flex-1">
          <Users class="size-4 text-muted-foreground" />
          <span class="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span class="block h-full rounded-full bg-success transition-[width] duration-500" :style="{ width: `${day.stats.expected ? (day.stats.posted / day.stats.expected) * 100 : 0}%` }" /></span>
          <span class="text-sm font-semibold tabular-nums">{{ day.stats.posted }}/{{ day.stats.expected }} posted</span>
        </div>
        <span class="inline-flex items-center gap-1.5 text-sm"><CircleCheck class="size-4 text-success" /> <span class="font-semibold tabular-nums">{{ day.stats.completed }}</span> tasks completed</span>
        <span class="inline-flex items-center gap-1.5 text-sm" :class="day.stats.blockers ? 'text-destructive' : ''">
          <CircleAlert class="size-4" /> <span class="font-semibold tabular-nums">{{ day.stats.blockers }}</span> blocker{{ day.stats.blockers === 1 ? '' : 's' }}
        </span>
      </section>

      <p
        v-if="date === today && missingNames.length && (project?.myRole === 'admin' || project?.lead?.id === auth.user?.id)"
        class="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[12.5px] text-amber-900 dark:text-amber-200"
      >
        Manager view · still waiting on {{ missingNames.slice(0, 6).join(', ') }}{{ missingNames.length > 6 ? ` and ${missingNames.length - 6} more` : '' }}.
      </p>

      <StandupEditor
        v-if="showEditor"
        :project-id="projectId"
        :date="date"
        :previous-date="day.previousDate"
        :update="me?.update ?? null"
        @saved="
          editing = false;
          load()
        "
        @cancel="editing = false"
      />

      <section
        v-if="showHandoff"
        class="flex flex-col gap-3 rounded-xl border border-success/25 bg-success/[0.04] px-4 py-3 sm:flex-row sm:items-center"
      >
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success"><CircleCheck class="size-4" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-[13px] font-semibold">Standup done — keep the workday moving</p>
          <p class="text-[12px] text-muted-foreground">Clear what’s due, then run the board for this project.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button size="sm" as-child>
            <RouterLink :to="{ name: 'issues', query: { assigneeId: 'me', sort: 'dueDate' } }"><ListTodo /> My tasks</RouterLink>
          </Button>
          <Button size="sm" variant="outline" as-child>
            <RouterLink :to="{ name: 'project-board', params: { projectId } }"><Columns3 /> Board</RouterLink>
          </Button>
          <Button size="sm" variant="ghost" as-child>
            <RouterLink :to="{ name: 'home' }">Home <ArrowRight /></RouterLink>
          </Button>
        </div>
      </section>

      <EmptyState
        v-if="!day.members.length"
        :icon="ClipboardList"
        title="No one to stand up with yet"
        description="Invite teammates to this project — standup only works when people post together."
        class="border bg-card py-12"
      >
        <Button
          v-if="project?.myRole === 'admin' || auth.isOrganizationAdmin"
          variant="brand"
          as-child
        >
          <RouterLink :to="{ name: 'project-settings', params: { projectId }, query: { tab: 'members' } }">
            <Users /> Invite people
          </RouterLink>
        </Button>
        <Button v-else variant="outline" as-child>
          <RouterLink :to="{ name: 'home', query: { startDay: '1' } }">Back to Start my day</RouterLink>
        </Button>
      </EmptyState>
      <div v-else class="grid items-start gap-3 md:grid-cols-2 2xl:grid-cols-3">
        <StandupMemberCard
          v-for="member in teammates"
          :key="member.user.id"
          :member="member"
          :issue-keys="issueKeys"
          :previous-date="day.previousDate"
          :is-me="member.user.id === auth.user?.id"
          :project-id="projectId"
          @edit="editing = true"
        />
      </div>
    </template>
  </div>
</template>
