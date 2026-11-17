<script setup lang="ts">
import { format, isValid, parseISO } from 'date-fns'
import { Bot, Copy, MessageSquareReply, Pencil, Quote, SmilePlus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import ChatAttachment from '@/modules/meetings/components/ChatAttachment.vue'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { UserSummary } from '@/types/models'
import { type AssistantCommand, type ChatMessage, REACTIONS, chatApi } from '../chat.api'
import AssistantCard from './AssistantCard.vue'

const props = withDefaults(
  defineProps<{
    message: ChatMessage
    projectId: string
    members?: UserSummary[]
    canEdit: boolean
    canDelete: boolean
    /** Members+ can reply/quote/react; viewers are read-only. */
    canPost?: boolean
    grouped: boolean
    highlighted: boolean
    reply?: boolean
  }>(),
  { members: () => [], canPost: true, reply: false },
)
const emit = defineEmits<{
  edit: [body: string]
  remove: []
  useCommand: [command: AssistantCommand]
  quote: []
  copyLink: []
  reply: []
  react: [emoji: string]
}>()

const auth = useAuthStore()
const isBot = computed(() => props.message.kind === 'bot')
const issueKeys = computed(() => props.message.issues.map((issue) => issue.key))
const time = computed(() => {
  const date = parseISO(props.message.createdAt)
  return isValid(date) ? format(date, 'HH:mm') : ''
})
const canReply = computed(() => props.canPost && !props.reply && props.message.kind === 'user' && !props.message.parentId)

/** For rich assistant replies the card carries the details, so only the opening sentence is shown as text. */
const body = computed(() => {
  const meta = props.message.meta
  if (!isBot.value || !meta) return props.message.body
  if (meta.type === 'standup_draft') return props.message.body.split('\n\n')[0]
  if (meta.type === 'issue_status' && meta.issues.length) return ''
  if (meta.type === 'help') return props.message.body.split('\n')[0]
  return props.message.body
})

const nameOf = (userId: string) => (userId === auth.user?.id ? 'You' : (props.members.find((person) => person.id === userId)?.name ?? 'Someone'))
const reactedBy = (userIds: string[]) => {
  const names = userIds.map(nameOf)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
}
const resolveFile = (fileId: string) => chatApi.fileLink(props.projectId, fileId)

const isEditing = ref(false)
const draft = ref('')
function startEditing() {
  draft.value = props.message.body
  isEditing.value = true
}
function saveEdit() {
  if (draft.value.trim() && draft.value.trim() !== props.message.body) emit('edit', draft.value.trim())
  isEditing.value = false
}
</script>

<template>
  <article
    :id="`message-${message.id}`"
    class="group relative flex gap-3 transition-colors hover:bg-muted/40"
    :class="[
      reply ? 'gap-2.5 py-1 pr-4 pl-14' : grouped ? 'px-4 py-0.5' : 'px-4 pt-3 pb-0.5',
      highlighted && 'bg-primary/8 ring-1 ring-primary/30 ring-inset',
    ]"
  >
    <div class="shrink-0" :class="reply ? 'w-7' : 'w-9'">
      <template v-if="!grouped || reply">
        <span v-if="isBot" class="flex items-center justify-center bg-brand text-white shadow-soft" :class="reply ? 'size-7' : 'size-9'"><Bot :class="reply ? 'size-4' : 'size-5'" /></span>
        <UserAvatar v-else :user="message.author" :size="reply ? 'sm' : 'md'" :class="reply ? 'size-7' : 'size-9'" />
      </template>
      <span v-else class="hidden pt-1 text-right text-[10px] leading-5 text-muted-foreground tabular-nums group-hover:block">{{ time }}</span>
    </div>

    <div class="min-w-0 flex-1">
      <p v-if="!grouped || reply" class="flex flex-wrap items-baseline gap-x-2">
        <span class="font-semibold" :class="reply ? 'text-xs' : 'text-sm'">{{ isBot ? 'Vector Assistant' : message.author?.name ?? 'Former member' }}</span>
        <span v-if="isBot" class="bg-primary/10 px-1 text-[10px] font-semibold tracking-wide text-primary uppercase">Bot</span>
        <span v-if="isBot && message.meta?.requestedBy" class="text-xs text-muted-foreground">for {{ message.meta.requestedBy.name }}</span>
        <span class="text-xs text-muted-foreground tabular-nums">{{ time }}</span>
      </p>

      <div v-if="isEditing" class="mt-1 space-y-2">
        <Textarea v-model="draft" rows="3" aria-label="Edit message" @keydown.enter.exact.prevent="saveEdit" @keydown.escape="isEditing = false" />
        <div class="flex gap-2">
          <Button size="sm" @click="saveEdit">Save</Button>
          <Button size="sm" variant="ghost" @click="isEditing = false">Cancel</Button>
        </div>
      </div>
      <template v-else>
        <RichText v-if="body" :source="body" :issue-keys="issueKeys" compact />
        <span v-if="message.editedAt" class="text-[11px] text-muted-foreground">(edited)</span>
        <div v-if="isBot && message.meta" class="mt-2 max-w-2xl">
          <AssistantCard :meta="message.meta" :project-id="projectId" :issue-keys="issueKeys" @use-command="(command) => emit('useCommand', command)" />
        </div>
        <div v-else-if="message.issues.length" class="mt-1.5 flex flex-wrap gap-1.5">
          <RouterLink
            v-for="issue in message.issues"
            :key="issue.id"
            :to="{ name: 'issue', params: { issueKey: issue.key } }"
            class="inline-flex max-w-72 items-center gap-1.5 border bg-card px-2 py-1 text-xs transition-colors hover:border-primary/40 hover:bg-accent/40"
            :title="`${issue.key} ${issue.title} · ${issue.status?.name ?? ''} · recorded on the task`"
          >
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: issue.status?.color ?? 'var(--muted-foreground)' }" />
            <span class="font-mono font-semibold">{{ issue.key }}</span>
            <span class="truncate text-muted-foreground">{{ issue.title }}</span>
          </RouterLink>
        </div>
        <div v-if="message.files?.length" class="mt-1.5 flex flex-wrap gap-2">
          <ChatAttachment v-for="file in message.files" :key="file.id" :file="file" :resolve="resolveFile" />
        </div>
      </template>

      <div v-if="message.reactions?.length && !isEditing" class="mt-1.5 flex flex-wrap gap-1">
        <Tooltip v-for="reaction in message.reactions" :key="reaction.emoji">
          <TooltipTrigger as-child>
            <button
              type="button"
              class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors"
              :class="
                reaction.userIds.includes(auth.user?.id ?? '')
                  ? 'border-primary/50 bg-primary/10 font-semibold text-primary'
                  : 'border-border bg-background text-muted-foreground hover:border-input hover:text-foreground'
              "
              :aria-label="`${reaction.emoji} ${reaction.userIds.length}: ${reactedBy(reaction.userIds)}`"
              :disabled="!canPost"
              @click="canPost && emit('react', reaction.emoji)"
            >
              <span class="text-sm leading-none">{{ reaction.emoji }}</span> {{ reaction.userIds.length }}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{{ reactedBy(reaction.userIds) }}</TooltipContent>
        </Tooltip>
        <Popover v-if="canPost">
          <PopoverTrigger as-child>
            <button type="button" class="inline-flex h-6 items-center rounded-full border border-dashed border-border px-1.5 text-muted-foreground hover:border-input hover:text-foreground" aria-label="Add a reaction">
              <SmilePlus class="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" class="w-auto p-1">
            <div class="flex gap-0.5">
              <button
                v-for="emoji in REACTIONS"
                :key="emoji"
                type="button"
                class="flex size-9 items-center justify-center rounded-md text-xl transition-transform hover:scale-125 hover:bg-accent"
                :aria-label="`React with ${emoji}`"
                @click="emit('react', emoji)"
              >
                {{ emoji }}
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>

    <div v-if="!isEditing" class="absolute top-1 right-3 hidden items-center border bg-card shadow-soft group-focus-within:flex group-hover:flex">
      <template v-if="canPost">
        <button
          v-for="emoji in REACTIONS"
          :key="emoji"
          type="button"
          class="flex size-7 items-center justify-center text-base transition-transform hover:scale-125 hover:bg-accent"
          :aria-label="`React with ${emoji}`"
          :title="`React with ${emoji}`"
          @click="emit('react', emoji)"
        >
          {{ emoji }}
        </button>
        <span class="mx-0.5 h-4 w-px bg-border" />
        <Button v-if="canReply" variant="ghost" size="icon-sm" aria-label="Reply" @click="emit('reply')"><MessageSquareReply /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Quote message" @click="emit('quote')"><Quote /></Button>
      </template>
      <Button variant="ghost" size="icon-sm" aria-label="Copy message link" @click="emit('copyLink')"><Copy /></Button>
      <Button v-if="canEdit" variant="ghost" size="icon-sm" aria-label="Edit message" @click="startEditing"><Pencil /></Button>
      <Button v-if="canDelete" variant="ghost" size="icon-sm" aria-label="Delete message" class="text-destructive" @click="emit('remove')"><Trash2 /></Button>
    </div>
  </article>
</template>
