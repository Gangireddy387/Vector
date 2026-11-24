<script setup lang="ts">
import { format, isToday, parseISO } from 'date-fns'
import { Ban, Bookmark, BookmarkCheck, CircleAlert, Copy, Ellipsis, EyeOff, Forward, History, Link2, ListTodo, Pencil, Pin, PinOff, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import EmojiStickerPicker from '@/components/common/EmojiStickerPicker.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import PersonCard from '@/components/common/PersonCard.vue'
import StickerBubble from '@/components/common/StickerBubble.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { isStickerMessage } from '@/lib/emoji-stickers'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDevice } from '@/composables/useDevice'
import ChatAttachment from '@/modules/meetings/components/ChatAttachment.vue'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { UserSummary } from '@/types/models'
import { type ChatMessage, type ComposerExtras, REACTIONS, messagesApi } from '../messages.api'
import ChannelComposer from './ChannelComposer.vue'
import MessageApprovalCard from './MessageApprovalCard.vue'
import MessagePollCard from './MessagePollCard.vue'

/**
 * One post or reply in a channel, like Teams: who wrote it, an "Important" mark and subject, formatted text, shared
 * files and reactions. Hovering shows quick reactions and a "…" menu (save, pin, copy link, mark unread, edit, delete).
 */
const props = withDefaults(
  defineProps<{
    message: ChatMessage
    people: UserSummary[]
    reply?: boolean
    editing?: boolean
    saved?: boolean
    save: (body: string, extras: ComposerExtras) => Promise<boolean>
  }>(),
  { reply: false, editing: false, saved: false },
)
const emit = defineEmits<{
  react: [emoji: string]
  sticker: [token: string]
  copy: []
  copyLink: []
  pin: []
  toggleSaved: []
  markUnread: []
  createTask: []
  forward: []
  showHistory: []
  votePoll: [optionIndex: number]
  closePoll: []
  respondApproval: [decision: 'approved' | 'rejected']
  edit: []
  cancelEdit: []
  remove: []
}>()

const auth = useAuthStore()
const { isDesktop } = useDevice()
/** Phone has no hover — tap the post to reveal the action bar (same idea as DM threads). */
const revealed = ref(false)
const isMine = computed(() => props.message.authorId === auth.user?.id)
const nameOf = (userId: string) => (userId === auth.user?.id ? 'You' : (props.people.find((person) => person.id === userId)?.name ?? 'Someone'))
const reactedBy = (userIds: string[]) => {
  const names = userIds.map(nameOf)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
}
const timeLabel = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? format(date, 'HH:mm') : format(date, 'd MMM, HH:mm')
}
const resolveFile = (fileId: string) => messagesApi.fileLink(props.message.conversationId, fileId)
const hoverButton =
  'flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
</script>

<template>
  <div
    class="group/msg relative flex"
    :class="[reply ? 'gap-2.5 py-2 pr-4 pl-8' : 'gap-3 px-4 pt-3 pb-2', message.important && !message.deletedAt && !reply && 'border-l-[3px] border-l-red-500']"
    @click="!isDesktop && (revealed = !revealed)"
  >
    <PersonCard :user="message.author" class="mt-0.5 shrink-0 self-start">
      <UserAvatar :user="message.author" :size="reply ? 'sm' : 'md'" :class="reply ? 'size-7' : 'size-9'" presence />
    </PersonCard>
    <div class="min-w-0 flex-1">
      <p class="flex flex-wrap items-baseline gap-x-2" :class="reply ? 'text-[12.5px]' : 'text-[13px]'">
        <PersonCard :user="message.author">
          <span class="font-semibold hover:text-primary hover:underline">{{ message.author?.name ?? 'Someone' }}</span>
        </PersonCard>
        <span class="text-[11px] text-muted-foreground" :title="format(parseISO(message.createdAt), 'd MMM yyyy, HH:mm')">{{ timeLabel(message.createdAt) }}</span>
        <button
          v-if="message.editedAt && !message.deletedAt"
          type="button"
          class="text-[11px] text-muted-foreground italic hover:text-foreground hover:underline"
          :title="`Edited ${format(parseISO(message.editedAt), 'd MMM, HH:mm')} · View history`"
          @click="emit('showHistory')"
        >
          Edited
        </button>
        <span v-if="message.pinnedAt" class="inline-flex items-center gap-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"><Pin class="size-3" /> Pinned</span>
        <span v-if="saved" class="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary"><BookmarkCheck class="size-3" /> Saved</span>
      </p>

      <p v-if="message.deletedAt" class="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground italic"><Ban class="size-3.5" /> This message was deleted</p>
      <ChannelComposer
        v-else-if="editing"
        class="mt-1.5"
        compact
        :placeholder="reply ? 'Edit your reply' : 'Edit your post'"
        :people="people"
        :initial="message.body"
        :initial-subject="message.subject"
        :allow-subject="!reply"
        allow-everyone
        :send="save"
        @cancel="emit('cancelEdit')"
      />
      <template v-else>
        <p v-if="message.important" class="mt-1 flex items-center gap-1 text-[11px] font-bold tracking-wide text-red-600 uppercase dark:text-red-400"><CircleAlert class="size-3.5" /> Important!</p>
        <h3 v-if="message.subject" class="mt-1 text-[15.5px] leading-snug font-semibold">{{ message.subject }}</h3>
        <StickerBubble v-if="message.body && !message.poll && isStickerMessage(message.body)" class="mt-1" :body="message.body" />
        <MarkdownContent v-else-if="message.body && !message.poll" :source="message.body" class="compact mt-0.5 break-words" :class="reply ? 'text-[13.5px]' : 'text-[14px]'" />
        <MarkdownContent v-else-if="message.body && message.poll && message.body !== message.poll.question" :source="message.body" class="compact mt-0.5 break-words" :class="reply ? 'text-[13.5px]' : 'text-[14px]'" />
        <MessagePollCard v-if="message.poll && !message.deletedAt" :poll="message.poll" @vote="emit('votePoll', $event)" @close="emit('closePoll')" />
        <MessageApprovalCard v-if="message.approval && !message.deletedAt" :approval="message.approval" @respond="emit('respondApproval', $event)" />
        <div v-if="message.files?.length" class="mt-1.5 flex flex-wrap gap-2">
          <ChatAttachment v-for="file in message.files" :key="file.id" :file="file" :resolve="resolveFile" />
        </div>
      </template>

      <div v-if="message.reactions?.length && !message.deletedAt" class="mt-1.5 flex flex-wrap gap-1">
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
              @click="emit('react', reaction.emoji)"
            >
              <span class="text-sm leading-none">{{ reaction.emoji }}</span> {{ reaction.userIds.length }}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{{ reactedBy(reaction.userIds) }}</TooltipContent>
        </Tooltip>
        <EmojiStickerPicker context="react" @emoji="emit('react', $event)" @sticker="emit('sticker', $event)" />
      </div>
    </div>

    <!-- Desktop: hover bar. Phone: tap the post to reveal (no hover). -->
    <div
      v-if="!editing"
      class="absolute right-3 flex items-stretch overflow-hidden rounded-lg bg-popover shadow-elevated ring-1 ring-border transition-opacity"
      :class="[
        reply ? 'top-1' : 'top-1.5',
        isDesktop
          ? 'opacity-100 sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus-within:opacity-100 sm:has-[[data-state=open]]:opacity-100'
          : revealed
            ? 'opacity-100'
            : 'pointer-events-none opacity-0',
      ]"
      role="toolbar"
      :aria-label="reply ? 'Reply actions' : 'Post actions'"
      @click.stop
    >
      <template v-if="!message.deletedAt">
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
        <EmojiStickerPicker
          context="react"
          trigger-class="h-8"
          @emoji="emit('react', $event)"
          @sticker="emit('sticker', $event)"
        />
        <span class="my-1.5 w-px shrink-0 self-stretch bg-border" />
      </template>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button type="button" :class="hoverButton" aria-label="More options" title="More options"><Ellipsis class="size-4" /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-52">
          <template v-if="message.deletedAt">
            <DropdownMenuItem variant="destructive" @select="emit('remove')"><Trash2 /> Remove from my view</DropdownMenuItem>
          </template>
          <template v-else>
            <DropdownMenuItem @select="emit('toggleSaved')">
              <BookmarkCheck v-if="saved" /><Bookmark v-else /> {{ saved ? 'Unsave this message' : 'Save this message' }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('createTask')"><ListTodo /> Create task from this</DropdownMenuItem>
            <DropdownMenuItem @select="emit('forward')"><Forward /> Forward</DropdownMenuItem>
            <DropdownMenuItem v-if="!reply" @select="emit('pin')">
              <PinOff v-if="message.pinnedAt" /><Pin v-else /> {{ message.pinnedAt ? 'Unpin' : 'Pin to the top' }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="emit('copyLink')"><Link2 /> Copy link</DropdownMenuItem>
            <DropdownMenuItem v-if="message.body" @select="emit('copy')"><Copy /> Copy text</DropdownMenuItem>
            <DropdownMenuItem v-if="message.editedAt" @select="emit('showHistory')"><History /> View edit history</DropdownMenuItem>
            <DropdownMenuItem v-if="!isMine" @select="emit('markUnread')"><EyeOff /> Mark as unread</DropdownMenuItem>
            <template v-if="isMine">
              <DropdownMenuSeparator />
              <DropdownMenuItem v-if="message.body || message.subject" @select="emit('edit')"><Pencil /> Edit</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" @select="emit('remove')"><Trash2 /> Delete</DropdownMenuItem>
            </template>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
