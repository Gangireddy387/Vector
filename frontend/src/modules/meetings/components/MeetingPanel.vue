<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { ClipboardList, Crown, MessageSquareText, NotebookPen, Send, Trash2, UsersRound } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type Meeting, type MeetingUpdate, meetingsApi } from '../meetings.api'

const props = defineProps<{ meeting: Meeting; updates: MeetingUpdate[] }>()
const emit = defineEmits<{ posted: [update: MeetingUpdate]; removed: [id: string]; notes: [notes: string | null] }>()
const tab = defineModel<'updates' | 'people' | 'notes'>('tab', { default: 'updates' })

const auth = useAuthStore()
const confirm = useConfirm()
const draft = ref('')
const isPosting = ref(false)
const notes = ref(props.meeting.notes ?? '')
const notesState = ref<'idle' | 'saving' | 'saved'>('idle')

const isOver = computed(() => props.meeting.status === 'ended' || props.meeting.status === 'cancelled')
const STANDUP = 'Yesterday: \nToday: \nBlockers: '

watch(
  () => props.meeting.notes,
  (value) => {
    if (notesState.value === 'idle') notes.value = value ?? ''
  },
)

/** Host first, then who is in the call, who joined earlier and who was only invited. */
const people = computed(() => {
  const list = [
    ...(props.meeting.host ? [{ ...props.meeting.host, joinedAt: null as string | null, isHost: true }] : []),
    ...props.meeting.participants.filter((person) => person.id !== props.meeting.host?.id).map((person) => ({ ...person, isHost: false })),
  ]
  const rank = (person: (typeof list)[number]) => (person.isHost ? 0 : props.meeting.inCall.includes(person.id) ? 1 : person.joinedAt ? 2 : 3)
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
})
const presence = (person: { id: string; joinedAt: string | null }) =>
  props.meeting.inCall.includes(person.id) ? 'In the call' : person.joinedAt ? `Joined at ${format(parseISO(person.joinedAt), 'HH:mm')}` : 'Invited'

async function post() {
  const body = draft.value.trim()
  if (!body) return
  isPosting.value = true
  try {
    emit('posted', await meetingsApi.postUpdate(props.meeting.id, body))
    draft.value = ''
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isPosting.value = false
  }
}

const canDelete = (update: MeetingUpdate) => update.authorId === auth.user?.id || props.meeting.canManage
async function remove(update: MeetingUpdate) {
  if (!(await confirm({ title: 'Delete this update?', description: 'It is removed for everyone in the meeting.', confirmLabel: 'Delete', destructive: true }))) return
  try {
    await meetingsApi.removeUpdate(props.meeting.id, update.id)
    emit('removed', update.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const saveNotes = useDebounceFn(async () => {
  try {
    const value = notes.value.trim() || null
    await meetingsApi.update(props.meeting.id, { notes: value })
    emit('notes', value)
    notesState.value = 'saved'
  } catch (error) {
    notesState.value = 'idle'
    toast.error(getErrorMessage(error))
  }
}, 800)
function onNotesInput() {
  notesState.value = 'saving'
  void saveNotes()
}

const TABS = [
  { value: 'updates', label: 'Updates', icon: MessageSquareText },
  { value: 'people', label: 'People', icon: UsersRound },
  { value: 'notes', label: 'Notes', icon: NotebookPen },
] as const
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-card text-card-foreground">
    <div class="flex shrink-0 border-b border-border/70" role="tablist">
      <button
        v-for="item in TABS"
        :key="item.value"
        type="button"
        role="tab"
        class="relative flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors"
        :class="tab === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-selected="tab === item.value"
        @click="tab = item.value"
      >
        <component :is="item.icon" class="size-4" /> {{ item.label }}
        <span v-if="item.value === 'updates' && updates.length" class="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{{ updates.length }}</span>
        <span v-if="item.value === 'people'" class="rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{{ people.length }}</span>
        <span v-if="tab === item.value" class="absolute inset-x-3 -bottom-px h-0.5 bg-primary" />
      </button>
    </div>

    <template v-if="tab === 'updates'">
      <ol class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <li v-for="update in updates" :key="update.id" class="group flex gap-2.5">
          <UserAvatar :user="update.author" size="md" class="mt-0.5" />
          <div class="min-w-0 flex-1 border border-border/70 bg-muted/30 px-3 py-2">
            <div class="flex items-baseline gap-2">
              <span class="truncate text-sm font-semibold">{{ update.author?.name ?? 'Someone' }}</span>
              <span class="shrink-0 text-[11px] text-muted-foreground" :title="format(parseISO(update.createdAt), 'd MMM yyyy, HH:mm')">{{ timeAgo(update.createdAt) }}</span>
              <button
                v-if="canDelete(update)"
                type="button"
                class="ml-auto rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100"
                aria-label="Delete update"
                @click="remove(update)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <p class="mt-1 text-sm break-words whitespace-pre-wrap">{{ update.body }}</p>
          </div>
        </li>
        <li v-if="!updates.length" class="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
          <ClipboardList class="size-8 text-muted-foreground/60" />
          No updates yet. Share what you worked on, what is next and anything blocking you.
        </li>
      </ol>
      <form v-if="meeting.status !== 'cancelled'" class="shrink-0 space-y-2 border-t border-border/70 p-3" @submit.prevent="post">
        <Textarea
          v-model="draft"
          rows="3"
          maxlength="4000"
          placeholder="Share your update…"
          class="resize-none text-sm"
          @keydown.enter.exact.prevent="post"
        />
        <div class="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" class="text-xs" :disabled="Boolean(draft.trim())" @click="draft = STANDUP">
            <ClipboardList /> Stand-up template
          </Button>
          <Button type="submit" size="sm" variant="brand" class="ml-auto" :loading="isPosting" :disabled="!draft.trim()"><Send /> Share</Button>
        </div>
      </form>
    </template>

    <ul v-else-if="tab === 'people'" class="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
      <li v-for="person in people" :key="person.id" class="flex items-center gap-3 px-4 py-2.5">
        <span class="relative">
          <UserAvatar :user="person" size="md" />
          <span v-if="meeting.inCall.includes(person.id)" class="absolute -right-0.5 -bottom-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-card" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5 truncate text-sm font-medium">
            {{ person.name }}<span v-if="person.id === auth.user?.id" class="text-muted-foreground">(you)</span>
            <Crown v-if="person.isHost" class="size-3.5 text-amber-500" aria-label="Host" />
          </span>
          <span class="block truncate text-xs" :class="meeting.inCall.includes(person.id) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
            {{ person.isHost ? (meeting.inCall.includes(person.id) ? 'Host · in the call' : 'Host') : presence(person) }}
          </span>
        </span>
      </li>
    </ul>

    <div v-else class="flex min-h-0 flex-1 flex-col gap-2 p-4">
      <template v-if="meeting.canManage">
        <Textarea
          v-model="notes"
          class="min-h-0 flex-1 resize-none text-sm"
          maxlength="20000"
          placeholder="Decisions, action items and who owns them… Everyone invited can read these notes."
          @input="onNotesInput"
        />
        <p class="text-[11px] text-muted-foreground">{{ notesState === 'saving' ? 'Saving…' : notesState === 'saved' ? 'Saved' : 'Saves as you type' }}</p>
      </template>
      <p v-else-if="meeting.notes" class="min-h-0 flex-1 overflow-y-auto text-sm whitespace-pre-wrap">{{ meeting.notes }}</p>
      <p v-else class="py-10 text-center text-sm text-muted-foreground">
        {{ isOver ? 'The host did not write notes for this meeting.' : 'The host’s notes show here, such as decisions and action items.' }}
      </p>
    </div>
  </div>
</template>
