<script setup lang="ts">
import { format, isValid, parseISO } from 'date-fns'
import { Bot, Copy, MessageSquareReply, Pencil, Quote, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import EmojiStickerPicker from '@/components/common/EmojiStickerPicker.vue'
import JumboEmoji from '@/components/common/JumboEmoji.vue'
import RichText from '@/components/common/RichText.vue'
import StickerBubble from '@/components/common/StickerBubble.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { isJumboEmojiMessage, isStickerMessage } from '@/lib/emoji-stickers'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import ChatAttachment from '@/modules/meetings/components/ChatAttachment.vue'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
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
  sticker: [token: string]
  draftPosted: []
}>()

const auth = useAuthStore()
const openIssue = useOpenIssue()
const isBot = computed(() => props.message.kind === 'bot')
/** /status, /mytasks, /blockers — show what was asked + who, not "Vector Assistant Bot". */
const isRequestedReply = computed(() => {
  const meta = props.message.meta
  if (!isBot.value || !meta?.requestedBy) return false
  return meta.type === 'blockers' || meta.type === 'issue_status' || meta.type === 'issue_list'
})
/** e.g. "Asked for status of DEMO-6", "Asked for my tasks", "Asked for blockers". */
const requestLabel = computed(() => {
  const meta = props.message.meta
  if (!meta || !isRequestedReply.value) return null
  if (meta.type === 'blockers') return 'Asked for blockers'
  if (meta.type === 'issue_list') return 'Asked for my tasks'
  if (meta.type === 'issue_status') {
    const keys = meta.issues.map((issue) => issue.key).filter(Boolean)
    if (keys.length === 1) return `Asked for status of ${keys[0]}`
    if (keys.length > 1) return `Asked for status of ${keys.join(', ')}`
    return 'Asked for status'
  }
  return 'Asked for'
})
const headerName = computed(() => {
  if (isRequestedReply.value && requestLabel.value) return requestLabel.value
  if (isBot.value) return 'Vector Assistant'
  return props.message.author?.name ?? 'Former member'
})
const issueKeys = computed(() => (props.message.issues ?? []).map((issue) => issue.key))
/** Standup posts already list keys in the body — skip the extra chip strip. */
const showIssueChips = computed(
  () => (props.message.issues ?? []).length > 0 && props.message.meta?.type !== 'standup_posted',
)
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
        <span class="font-semibold" :class="reply ? 'text-xs' : 'text-sm'">{{ headerName }}</span>
        <span v-if="isBot && !isRequestedReply" class="bg-primary/10 px-1 text-[10px] font-semibold tracking-wide text-primary uppercase">Bot</span>
        <span v-if="isBot && message.meta?.private" class="rounded bg-amber-500/15 px-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">Only you · review</span>
        <span v-else-if="message.meta?.type === 'standup_posted'" class="rounded bg-emerald-500/15 px-1 text-[10px] font-semibold tracking-wide text-emerald-700 uppercase dark:text-emerald-400">Posted to team</span>
        <span v-else-if="isRequestedReply && message.meta?.requestedBy" class="text-xs text-muted-foreground">{{ message.meta.requestedBy.name }}</span>
        <span v-else-if="isBot && message.meta?.requestedBy" class="text-xs text-muted-foreground">for {{ message.meta.requestedBy.name }}</span>
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
        <StickerBubble v-if="body && isStickerMessage(body)" class="mt-0.5" :body="body" />
        <JumboEmoji v-else-if="body && isJumboEmojiMessage(body)" :body="body" :compact="reply" />
        <RichText v-else-if="body" :source="body" :issue-keys="issueKeys" compact />
        <span v-if="message.editedAt" class="text-[11px] text-muted-foreground">(edited)</span>
        <div v-if="isBot && message.meta" class="mt-2 max-w-2xl">
          <AssistantCard
            :meta="message.meta"
            :project-id="projectId"
            :issue-keys="issueKeys"
            @use-command="(command) => emit('useCommand', command)"
            @draft-posted="emit('draftPosted')"
          />
        </div>
        <div v-else-if="showIssueChips" class="mt-1.5 flex flex-wrap gap-1.5">
          <button
            v-for="issue in message.issues"
            :key="issue.id"
            type="button"
            class="inline-flex max-w-72 items-center gap-1.5 border bg-card px-2 py-1 text-left text-xs transition-colors hover:border-primary/40 hover:bg-accent/40"
            :title="`${issue.key} ${issue.title} · ${issue.status?.name ?? ''} · opens beside chat`"
            @click="openIssue(issue)"
          >
            <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: issue.status?.color ?? 'var(--muted-foreground)' }" />
            <span class="font-mono font-semibold">{{ issue.key }}</span>
            <span class="truncate text-muted-foreground">{{ issue.title }}</span>
          </button>
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
        <EmojiStickerPicker v-if="canPost" context="react" @emoji="emit('react', $event)" @sticker="emit('sticker', $event)" />
      </div>
    </div>

    <div
      v-if="!isEditing"
      class="absolute top-1 right-3 hidden items-stretch overflow-hidden rounded-lg border bg-card shadow-soft group-focus-within:flex group-hover:flex"
    >
      <template v-if="canPost">
        <button
          v-for="emoji in REACTIONS"
          :key="emoji"
          type="button"
          class="flex size-8 shrink-0 items-center justify-center text-base transition-colors hover:bg-accent"
          :aria-label="`React with ${emoji}`"
          :title="`React with ${emoji}`"
          @click="emit('react', emoji)"
        >
          {{ emoji }}
        </button>
        <EmojiStickerPicker context="react" trigger-class="h-8" @emoji="emit('react', $event)" @sticker="emit('sticker', $event)" />
        <span class="my-1.5 w-px shrink-0 self-stretch bg-border" />
        <Button v-if="canReply" variant="ghost" size="icon-sm" class="rounded-none" aria-label="Reply" @click="emit('reply')"><MessageSquareReply /></Button>
        <Button variant="ghost" size="icon-sm" class="rounded-none" aria-label="Quote message" @click="emit('quote')"><Quote /></Button>
      </template>
      <Button variant="ghost" size="icon-sm" class="rounded-none" aria-label="Copy message link" @click="emit('copyLink')"><Copy /></Button>
      <Button v-if="canEdit" variant="ghost" size="icon-sm" class="rounded-none" aria-label="Edit message" @click="startEditing"><Pencil /></Button>
      <Button v-if="canDelete" variant="ghost" size="icon-sm" class="rounded-none text-destructive" aria-label="Delete message" @click="emit('remove')"><Trash2 /></Button>
    </div>
  </article>
</template>
