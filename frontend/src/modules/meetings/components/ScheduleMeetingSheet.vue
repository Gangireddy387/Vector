<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { addMinutes, format, parseISO } from 'date-fns'
import { Check, Link2, PencilLine, Search, UsersRound, Video, X } from 'lucide-vue-next'
import { computed, reactive, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import FormField from '@/components/common/FormField.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { DatePicker, SelectField, TimeField, type SelectFieldOption } from '@/components/forms'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { structureApi } from '@/modules/departments/departments.api'
import { usersApi } from '@/modules/projects/projects.api'
import type { Team, UserSummary } from '@/types/models'
import { recurrenceLabel } from '../meeting-format'
import { type Meeting, type MeetingContext, type MeetingRecurrence, meetingsApi } from '../meetings.api'
import type { MeetingPreset } from '../useMeetingActions'

/** `null` closes the sheet, `{}` schedules a new meeting (`preset` fills in who and what it is for), `{ meeting }` edits one. */
const target = defineModel<{ meeting?: Meeting; preset?: MeetingPreset } | null>('target', { default: null })
const emit = defineEmits<{ saved: [meeting: Meeting] }>()

const auth = useAuthStore()
const isSaving = ref(false)
const showErrors = ref(false)
const people = ref<UserSummary[]>([])
const teams = ref<Team[]>([])
const search = ref('')
const context = ref<MeetingContext | null>(null)

const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })
const today = computed(() => format(now.value, 'yyyy-MM-dd'))
const nowTime = computed(() => format(now.value, 'HH:mm'))

const editing = computed(() => target.value?.meeting ?? null)
const isOpen = computed({
  get: () => target.value !== null,
  set: (open) => {
    if (!open) target.value = null
  },
})

const pad = (value: number) => String(value).padStart(2, '0')
/** The next quarter hour from now, so a new meeting never starts in the past. */
function nextSlot() {
  const minutes = now.value.getHours() * 60 + now.value.getMinutes()
  const slot = Math.min(Math.ceil((minutes + 1) / 15) * 15, 23 * 60 + 45)
  return `${pad(Math.floor(slot / 60))}:${pad(slot % 60)}`
}

const form = reactive({
  title: '',
  agenda: '',
  date: '',
  time: '',
  duration: 30,
  participantIds: [] as string[],
  recurrence: '' as MeetingRecurrence | '',
  guestAccess: false,
})

const DURATIONS: SelectFieldOption[] = [15, 30, 45, 60, 90, 120, 180].map((minutes) => ({
  value: String(minutes),
  label: minutes < 60 ? `${minutes} minutes` : minutes % 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes / 60} hour${minutes > 60 ? 's' : ''}`,
}))

watch(
  target,
  async (value) => {
    if (!value) return
    showErrors.value = false
    search.value = ''
    const { meeting, preset } = value
    const startsAt = meeting ? parseISO(meeting.startsAt) : null
    const presetPeople = (preset?.people ?? []).filter((person) => person.id !== auth.user?.id)
    context.value = meeting?.context ?? preset?.context ?? null
    Object.assign(form, {
      title: meeting?.title ?? preset?.title ?? '',
      agenda: meeting?.agenda ?? '',
      date: startsAt ? format(startsAt, 'yyyy-MM-dd') : today.value,
      time: startsAt ? format(startsAt, 'HH:mm') : nextSlot(),
      duration: meeting?.durationMinutes ?? 30,
      participantIds: meeting?.participants.map((person) => person.id).filter((id) => id !== meeting.host?.id) ?? [...new Set(presetPeople.map((person) => person.id))],
      recurrence: meeting?.recurrence ?? '',
      guestAccess: meeting?.guestAccess ?? false,
    })
    const [users, departments] = await Promise.all([usersApi.search({}).catch(() => []), structureApi.list().catch(() => [])])
    const known = [...(meeting?.participants ?? []), ...presetPeople, ...users]
    people.value = known.filter((user, index) => user.id !== auth.user?.id && known.findIndex((item) => item.id === user.id) === index)
    teams.value = departments.flatMap((department) => department.teams).filter((team) => team.members.length > 0)
  },
  { immediate: true },
)

const startsAt = computed(() => (form.date && form.time ? new Date(`${form.date}T${form.time}:00`) : null))
const isRescheduled = computed(() => !editing.value || startsAt.value?.getTime() !== parseISO(editing.value.startsAt).getTime())
const startsToday = computed(() => form.date === today.value)

const errors = computed(() => {
  const title = form.title.trim()
  return {
    title: !title ? 'Give the meeting a title' : title.length < 2 ? 'Use at least 2 characters' : null,
    date: !form.date ? 'Pick a day' : isRescheduled.value && form.date < today.value ? 'That day is over. Pick today or a later day.' : null,
    time: !form.time
      ? 'Pick a start time'
      : isRescheduled.value && startsToday.value && form.time < nowTime.value
        ? `It is already ${nowTime.value}. Pick a later time.`
        : null,
    people: form.participantIds.length === 0 ? 'Invite at least one person' : null,
  }
})
const errorFor = (key: keyof typeof errors.value) => (showErrors.value ? errors.value[key] : null)
const endsLabel = computed(() => (startsAt.value ? format(addMinutes(startsAt.value, form.duration), 'HH:mm') : ''))

const REPEATS: MeetingRecurrence[] = ['daily', 'weekdays', 'weekly', 'monthly']
const repeatOptions = computed<SelectFieldOption[]>(() => [
  { value: '', label: 'Does not repeat' },
  ...REPEATS.map((value) => ({ value, label: recurrenceLabel(value, startsAt.value ?? now.value) })),
])

const chosen = computed(() => form.participantIds.map((id) => people.value.find((person) => person.id === id)).filter((person): person is UserSummary => Boolean(person)))
const matches = computed(() => {
  const query = search.value.trim().toLowerCase()
  return people.value.filter((person) => !query || person.name.toLowerCase().includes(query) || person.email?.toLowerCase().includes(query)).slice(0, 40)
})
const isChosen = (id: string) => form.participantIds.includes(id)
function togglePerson(id: string) {
  form.participantIds = isChosen(id) ? form.participantIds.filter((item) => item !== id) : [...form.participantIds, id]
}
function addTeam(team: Team) {
  const ids = team.members.map((member) => member.id).filter((id) => id !== auth.user?.id && people.value.some((person) => person.id === id))
  form.participantIds = [...new Set([...form.participantIds, ...ids])]
  toast.success(`Added ${team.name}`, { description: `${ids.length} ${ids.length === 1 ? 'person' : 'people'} invited` })
}

async function save() {
  showErrors.value = true
  const problem = Object.values(errors.value).find(Boolean)
  if (problem || !startsAt.value) {
    toast.error('Check the highlighted fields', { description: problem ?? undefined })
    return
  }
  isSaving.value = true
  const input = {
    title: form.title.trim(),
    agenda: form.agenda.trim() || null,
    startsAt: startsAt.value.toISOString(),
    durationMinutes: form.duration,
    participantIds: form.participantIds,
    recurrence: form.recurrence || null,
  }
  try {
    const meeting = editing.value
      ? await meetingsApi.update(editing.value.id, input)
      : await meetingsApi.create({ ...input, guestAccess: form.guestAccess, contextType: context.value?.type ?? null, contextId: context.value?.id ?? null })
    toast.success(editing.value ? 'Meeting updated' : 'Meeting scheduled', { description: 'Invitations are in everyone’s Inbox and calendar.' })
    emit('saved', meeting)
    target.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent side="right" class="flex w-full flex-col gap-0 p-0 sm:max-w-xl" hide-close clear-backdrop @open-auto-focus.prevent>
      <header class="flex shrink-0 items-center gap-3 border-b border-border/70 px-5 py-3.5">
        <span class="flex size-9 shrink-0 items-center justify-center bg-brand text-white shadow-glow">
          <PencilLine v-if="editing" class="size-4" />
          <Video v-else class="size-4" />
        </span>
        <div class="min-w-0 flex-1">
          <SheetTitle class="truncate text-base font-semibold">{{ editing ? 'Edit meeting' : 'Schedule a meeting' }}</SheetTitle>
          <SheetDescription class="truncate text-xs">Everyone invited gets it in their Inbox and calendar, with a link to join the video call.</SheetDescription>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" @click="isOpen = false"><X /></Button>
      </header>

      <form class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5" @submit.prevent="save">
        <FormField label="Title" for="meeting-title" :error="errorFor('title')">
          <Input id="meeting-title" v-model="form.title" placeholder="e.g. Daily stand-up" maxlength="160" autofocus />
        </FormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <FormField label="Day" for="meeting-date" :error="errorFor('date')">
            <DatePicker id="meeting-date" v-model="form.date" :clearable="false" :min="today" />
          </FormField>
          <FormField label="Starts" for="meeting-time" :error="errorFor('time')" :hint="endsLabel ? `Ends at ${endsLabel}` : undefined">
            <TimeField
              id="meeting-time"
              v-model="form.time"
              aria-label="Start time"
              :min="startsToday ? nowTime : undefined"
              empty-text="No times left today. Pick another day."
            />
          </FormField>
          <FormField label="Length" for="meeting-duration">
            <SelectField
              id="meeting-duration"
              :model-value="String(form.duration)"
              :options="DURATIONS"
              @update:model-value="(value) => (form.duration = Number(value ?? 30))"
            />
          </FormField>
        </div>

        <FormField
          label="Repeat"
          for="meeting-repeat"
          :hint="form.recurrence ? 'The next meeting is added to everyone’s calendar once this one starts.' : undefined"
        >
          <SelectField
            id="meeting-repeat"
            :model-value="form.recurrence"
            :options="repeatOptions"
            @update:model-value="(value) => (form.recurrence = (value ?? '') as MeetingRecurrence | '')"
          />
        </FormField>

        <label v-if="!editing" class="flex items-start gap-3 border border-border/70 p-3">
          <Link2 class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium">Let guests join with a link</span>
            <span class="block text-xs text-muted-foreground">For people outside your organization. They wait until someone in the call lets them in.</span>
          </span>
          <Switch v-model="form.guestAccess" aria-label="Let guests join with a link" />
        </label>

        <FormField label="Agenda" for="meeting-agenda" optional>
          <Textarea id="meeting-agenda" v-model="form.agenda" rows="3" placeholder="What you will talk about, and what people should prepare" maxlength="4000" />
        </FormField>

        <div class="grid gap-2">
          <div class="flex items-baseline justify-between gap-2">
            <span class="text-sm font-medium">Invite people</span>
            <span class="text-xs text-muted-foreground">{{ form.participantIds.length }} invited</span>
          </div>

          <div v-if="teams.length" class="flex flex-wrap gap-1.5">
            <button
              v-for="team in teams"
              :key="team.id"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-full border border-border/80 px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/5"
              @click="addTeam(team)"
            >
              <UsersRound class="size-3.5 text-muted-foreground" /> {{ team.name }}
              <span class="text-muted-foreground">· {{ team.members.length }}</span>
            </button>
          </div>

          <div v-if="chosen.length" class="flex flex-wrap gap-1.5">
            <span v-for="person in chosen" :key="person.id" class="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-0.5 pr-1 pl-0.5 text-xs font-medium text-primary">
              <UserAvatar :user="person" size="xs" />
              {{ person.name }}
              <button type="button" class="rounded-full p-0.5 hover:bg-primary/15" :aria-label="`Remove ${person.name}`" @click="togglePerson(person.id)">
                <X class="size-3" />
              </button>
            </span>
          </div>

          <div class="relative">
            <Search class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="pl-8" placeholder="Search people by name or email" />
          </div>
          <ul class="max-h-64 divide-y divide-border/60 overflow-y-auto border border-border/70">
            <li v-for="person in matches" :key="person.id">
              <button type="button" class="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent" @click="togglePerson(person.id)">
                <UserAvatar :user="person" size="md" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ person.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{ person.title || person.email }}</span>
                </span>
                <span
                  class="flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                  :class="isChosen(person.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border'"
                >
                  <Check v-if="isChosen(person.id)" class="size-3" />
                </span>
              </button>
            </li>
            <li v-if="!matches.length" class="px-3 py-6 text-center text-sm text-muted-foreground">No one matches “{{ search }}”.</li>
          </ul>
          <p v-if="errorFor('people')" class="text-xs text-destructive" role="alert">{{ errorFor('people') }}</p>
        </div>

        <button type="submit" class="hidden" aria-hidden="true" tabindex="-1" />
      </form>

      <footer class="flex shrink-0 items-center gap-2 border-t border-border/70 px-5 py-3">
        <Button variant="brand" :loading="isSaving" @click="save">{{ editing ? 'Save changes' : 'Schedule meeting' }}</Button>
        <Button variant="ghost" @click="isOpen = false">Cancel</Button>
      </footer>
    </SheetContent>
  </Sheet>
</template>
