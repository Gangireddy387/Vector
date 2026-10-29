<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import { format, parseISO } from 'date-fns'
import { BarChart3, ClipboardList, Crown, MessageCircle, MessageSquareText, NotebookPen, Send, Trash2, UsersRound } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import { type Meeting, type MeetingPoll, type MeetingUpdate, meetingsApi } from '../meetings.api'
import { useMeetingCall } from '../useMeetingCall'
import CallChat from './CallChat.vue'
import CallPeople from './CallPeople.vue'
import CallPolls from './CallPolls.vue'
import GuestLinkCard from './GuestLinkCard.vue'

export type MeetingPanelTab = 'chat' | 'people' | 'polls' | 'updates' | 'notes'

/** Beside the call (`live`): chat, people, polls, updates and notes. Before and after it: updates, people, notes and polls. */
const props = withDefaults(defineProps<{ meeting: Meeting; updates: MeetingUpdate[]; polls?: MeetingPoll[]; live?: boolean }>(), { polls: () => [], live: false })
const emit = defineEmits<{ posted: [update: MeetingUpdate]; removed: [id: string]; notes: [notes: string | null]; changed: [meeting: Meeting]; breakouts: [] }>()
const tab = defineModel<MeetingPanelTab>('tab', { default: 'updates' })
const call = useMeetingCall()

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

const tabs = computed(() => {
  const list: Array<{ value: MeetingPanelTab; label: string; icon: typeof UsersRound; count?: number; alert?: boolean }> = []
  if (props.live) list.push({ value: 'chat', label: 'Chat', icon: MessageCircle, count: call.unreadChat.value || undefined, alert: true })
  list.push(
    { value: 'people', label: 'People', icon: UsersRound, count: props.live ? call.peers.value.length + 1 : people.value.length, alert: props.live && call.lobby.value.length > 0 },
    { value: 'updates', label: 'Updates', icon: MessageSquareText, count: props.updates.length || undefined },
  )
  if (props.live || props.polls.length) list.push({ value: 'polls', label: 'Polls', icon: BarChart3, count: props.live ? call.polls.value.length || undefined : props.polls.length })
  list.push({ value: 'notes', label: 'Notes', icon: NotebookPen })
  return list
})
watch(
  tabs,
  (list) => {
    if (!list.some((item) => item.value === tab.value)) tab.value = list[0]!.value
  },
  { immediate: true },
)
const showGuestLink = computed(() => props.meeting.canManage && !isOver.value)
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col bg-card text-card-foreground">
    <div class="flex shrink-0 border-b border-border/70" role="tablist">
      <button
        v-for="item in tabs"
        :key="item.value"
        type="button"
        role="tab"
        class="relative flex min-w-0 flex-1 items-center justify-center font-medium transition-colors"
        :class="[
          live ? 'flex-col gap-0.5 px-1 py-2 text-[11px]' : 'gap-1 px-2 py-2.5 text-sm',
          tab === item.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        ]"
        :aria-selected="tab === item.value"
        :title="item.label"
        @click="tab = item.value"
      >
        <span class="relative flex shrink-0">
          <component :is="item.icon" class="size-4" />
          <template v-if="live">
            <span
              v-if="item.count"
              class="absolute -top-1.5 left-3 rounded-full px-1 text-[9px] leading-tight tabular-nums"
              :class="item.alert && tab !== item.value ? 'bg-red-500 text-white' : 'bg-muted'"
            >
              {{ item.count }}
            </span>
            <span v-else-if="item.alert && tab !== item.value && item.value === 'people'" class="absolute -top-0.5 -right-1 size-2 rounded-full bg-red-500" />
          </template>
        </span>
        <span class="min-w-0 max-w-full truncate">{{ item.label }}</span>
        <template v-if="!live">
          <span
            v-if="item.count"
            class="rounded-full px-1.5 text-[10px] tabular-nums"
            :class="item.alert && tab !== item.value ? 'bg-red-500 text-white' : 'bg-muted'"
          >
            {{ item.count }}
          </span>
          <span v-else-if="item.alert && tab !== item.value && item.value === 'people'" class="size-2 rounded-full bg-red-500" />
        </template>
        <span v-if="tab === item.value" class="absolute inset-x-2 -bottom-px h-0.5 bg-primary" />
      </button>
    </div>

    <CallChat v-if="tab === 'chat' && live" />

    <CallPolls v-else-if="tab === 'polls'" :polls="live ? null : polls" />

    <CallPeople v-else-if="tab === 'people' && live" @breakouts="emit('breakouts')">
      <GuestLinkCard v-if="showGuestLink" :meeting="meeting" @changed="(value) => emit('changed', value)" />
    </CallPeople>

    <template v-else-if="tab === 'updates'">
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
      <li v-if="showGuestLink" class="p-3"><GuestLinkCard :meeting="meeting" @changed="(value) => emit('changed', value)" /></li>
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
