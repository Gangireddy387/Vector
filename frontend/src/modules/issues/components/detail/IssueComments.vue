<script setup lang="ts">
import { Bot, Eye, FileText, MessageSquare, MessageSquareReply, SmilePlus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import FilePreviewLightbox from '@/components/common/FilePreviewLightbox.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/composables/useConfirm'
import { isPreviewable } from '@/lib/file-preview'
import { timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { formatBytes } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { Attachment, Comment, CommentReaction, UserSummary } from '@/types/models'
import { COMMENT_REACTIONS, attachmentsApi, commentsApi } from '../../api/collaboration.api'
import CommentComposer from './CommentComposer.vue'

const props = withDefaults(
  defineProps<{ issueId: string; members: UserSummary[]; editable?: boolean; isAdmin?: boolean; refreshKey?: number }>(),
  { editable: true, isAdmin: false, refreshKey: 0 },
)
const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const confirm = useConfirm()
const comments = ref<Comment[]>([])
const editingId = ref<string | null>(null)
const replyToId = ref<string | null>(null)
const composer = ref<InstanceType<typeof CommentComposer> | null>(null)
const replyComposer = ref<InstanceType<typeof CommentComposer> | null>(null)
const previewOpen = ref(false)
const previewLoading = ref(false)
const previewUrl = ref<string | null>(null)
const previewOfficeEmbed = ref<string | null>(null)
const previewAttachment = ref<Attachment | null>(null)
let ownedPreviewUrl: string | null = null

const roots = computed(() => [...comments.value].reverse())
const memberName = (userId: string) => props.members.find((member) => member.id === userId)?.name ?? 'Someone'
const reactedBy = (userIds: string[]) => userIds.map(memberName).join(', ')

const load = async () => (comments.value = await commentsApi.list(props.issueId))
watch(() => [props.issueId, props.refreshKey], load, { immediate: true })

function applyReactions(commentId: string, reactions: CommentReaction[]) {
  comments.value = comments.value.map((root) => {
    if (root.id === commentId) return { ...root, reactions }
    if (!root.replies?.length) return root
    return {
      ...root,
      replies: root.replies.map((reply) => (reply.id === commentId ? { ...reply, reactions } : reply)),
    }
  })
}

async function attachFiles(commentId: string, files: File[]) {
  if (!files.length) return [] as Attachment[]
  return attachmentsApi.uploadForComment(commentId, files)
}

async function create(body: string, files: File[] = []) {
  if (!body.trim() && !files.length) return
  try {
    const created = await commentsApi.create(props.issueId, body.trim() || '')
    const uploaded = await attachFiles(created.id, files)
    comments.value = [
      ...comments.value,
      { ...created, replies: created.replies ?? [], attachments: uploaded },
    ]
    composer.value?.reset()
    emit('changed')
  } catch (error) {
    composer.value?.done()
    toast.error(getErrorMessage(error))
  }
}

async function createReply(parentId: string, body: string, files: File[] = []) {
  if (!body.trim() && !files.length) return
  try {
    const created = await commentsApi.create(props.issueId, body.trim() || '', { parentId })
    const uploaded = await attachFiles(created.id, files)
    comments.value = comments.value.map((root) =>
      root.id === parentId
        ? { ...root, replies: [...(root.replies ?? []), { ...created, attachments: uploaded }] }
        : root,
    )
    replyToId.value = null
    replyComposer.value?.reset()
    emit('changed')
  } catch (error) {
    replyComposer.value?.done()
    toast.error(getErrorMessage(error))
  }
}

async function update(comment: Comment, body: string) {
  try {
    const updated = await commentsApi.update(comment.id, body)
    comments.value = comments.value.map((root) => {
      if (root.id === comment.id) return { ...root, ...updated, replies: root.replies, attachments: root.attachments }
      if (!root.replies?.length) return root
      return {
        ...root,
        replies: root.replies.map((reply) =>
          reply.id === comment.id ? { ...reply, ...updated, attachments: reply.attachments } : reply,
        ),
      }
    })
    editingId.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function revokePreview() {
  if (ownedPreviewUrl) {
    URL.revokeObjectURL(ownedPreviewUrl)
    ownedPreviewUrl = null
  }
  previewUrl.value = null
  previewOfficeEmbed.value = null
}

async function openAttachment(attachment: Attachment) {
  previewAttachment.value = attachment
  previewOpen.value = true
  previewLoading.value = true
  revokePreview()
  try {
    const link = await attachmentsApi.link(attachment.id)
    previewOfficeEmbed.value = link.officeEmbedUrl
    if (!isPreviewable(attachment.mimeType, { office: Boolean(link.officeEmbedUrl) })) {
      previewOpen.value = false
      await attachmentsApi.download(attachment)
      return
    }
    if (link.officeEmbedUrl) {
      previewUrl.value = link.absoluteUrl
    } else {
      ownedPreviewUrl = await attachmentsApi.blobUrl(attachment)
      previewUrl.value = ownedPreviewUrl
    }
  } catch (error) {
    previewOpen.value = false
    toast.error(getErrorMessage(error))
  } finally {
    previewLoading.value = false
  }
}

function onPreviewOpen(value: boolean) {
  previewOpen.value = value
  if (!value) {
    revokePreview()
    previewAttachment.value = null
  }
}

async function remove(comment: Comment) {
  const isRoot = !comment.parentId
  if (
    !(await confirm({
      title: isRoot ? 'Delete this comment?' : 'Delete this reply?',
      description: isRoot && comment.replies?.length ? 'Replies under it will be removed too.' : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    }))
  ) {
    return
  }
  try {
    await commentsApi.remove(comment.id)
    if (isRoot) {
      comments.value = comments.value.filter((item) => item.id !== comment.id)
    } else {
      comments.value = comments.value.map((root) => ({
        ...root,
        replies: (root.replies ?? []).filter((reply) => reply.id !== comment.id),
      }))
    }
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function react(commentId: string, emoji: string) {
  if (!props.editable) return
  try {
    const result = await commentsApi.react(commentId, emoji)
    applyReactions(result.commentId, result.reactions)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function canManage(comment: Comment) {
  return comment.authorId === auth.user?.id || props.isAdmin
}
</script>

<template>
  <div class="space-y-5">
    <div v-if="editable" class="flex gap-3">
      <UserAvatar :user="auth.user" size="md" class="hidden sm:flex" />
      <div class="min-w-0 flex-1">
        <CommentComposer ref="composer" :members="members" @submit="create" />
      </div>
    </div>

    <EmptyState
      v-if="!comments.length"
      :icon="MessageSquare"
      title="No comments yet"
      description="Start the conversation — reply in threads and react with emoji. Mention teammates with @."
      class="py-6"
    />

    <ol class="space-y-5">
      <li v-for="comment in roots" :key="comment.id" class="space-y-3">
        <div class="flex gap-3">
          <UserAvatar v-if="comment.author" :user="comment.author" size="md" />
          <span v-else class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary">
            <Bot class="size-4" />
          </span>
          <div class="min-w-0 flex-1 space-y-1">
            <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span class="font-medium">{{ comment.author?.name ?? comment.guestAuthorName ?? 'Automation' }}</span>
              <span
                v-if="!comment.authorId && comment.guestAuthorName"
                class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              >Guest</span>
              <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
              <span v-if="comment.editedAt" class="text-xs text-muted-foreground">(edited)</span>
            </p>
            <CommentComposer
              v-if="editingId === comment.id"
              :members="members"
              :initial-value="comment.body"
              submit-label="Save"
              :allow-files="false"
              autofocus
              @submit="(body) => update(comment, body)"
              @cancel="editingId = null"
            />
            <template v-else>
              <MarkdownContent v-if="comment.body?.trim()" :source="comment.body" />
              <ul v-if="comment.attachments?.length" class="mt-2 flex flex-wrap gap-2">
                <li v-for="file in comment.attachments" :key="file.id">
                  <button
                    type="button"
                    class="inline-flex max-w-xs items-center gap-2 border bg-muted/40 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                    :title="file.fileName"
                    @click="openAttachment(file)"
                  >
                    <FileText class="size-3.5 shrink-0 text-primary" />
                    <span class="min-w-0 truncate font-medium">{{ file.fileName }}</span>
                    <span class="shrink-0 text-muted-foreground">{{ formatBytes(file.size) }}</span>
                    <Eye class="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              </ul>
              <div v-if="comment.reactions?.length" class="mt-1.5 flex flex-wrap gap-1">
                <button
                  v-for="reaction in comment.reactions"
                  :key="reaction.emoji"
                  type="button"
                  class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums transition-colors"
                  :class="
                    reaction.userIds.includes(auth.user?.id ?? '')
                      ? 'border-primary/50 bg-primary/10 font-semibold text-primary'
                      : 'border-border bg-background text-muted-foreground hover:border-input hover:text-foreground'
                  "
                  :aria-label="`${reaction.emoji} ${reaction.userIds.length}: ${reactedBy(reaction.userIds)}`"
                  :disabled="!editable"
                  :title="reactedBy(reaction.userIds)"
                  @click="react(comment.id, reaction.emoji)"
                >
                  <span class="text-sm leading-none">{{ reaction.emoji }}</span>
                  {{ reaction.userIds.length }}
                </button>
                <Popover v-if="editable">
                  <PopoverTrigger as-child>
                    <button
                      type="button"
                      class="inline-flex h-6 items-center rounded-full border border-dashed border-border px-1.5 text-muted-foreground hover:border-input hover:text-foreground"
                      aria-label="Add a reaction"
                    >
                      <SmilePlus class="size-3.5" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" class="w-auto p-1">
                    <div class="flex gap-0.5">
                      <button
                        v-for="emoji in COMMENT_REACTIONS"
                        :key="emoji"
                        type="button"
                        class="flex size-9 items-center justify-center rounded-md text-xl transition-transform hover:scale-125 hover:bg-accent"
                        :aria-label="`React with ${emoji}`"
                        @click="react(comment.id, emoji)"
                      >
                        {{ emoji }}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <button v-if="editable" type="button" class="inline-flex items-center gap-1 hover:text-foreground" @click="replyToId = comment.id">
                  <MessageSquareReply class="size-3.5" /> Reply
                </button>
                <Popover v-if="editable && !comment.reactions?.length">
                  <PopoverTrigger as-child>
                    <button type="button" class="inline-flex items-center gap-1 hover:text-foreground">
                      <SmilePlus class="size-3.5" /> React
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" class="w-auto p-1">
                    <div class="flex gap-0.5">
                      <button
                        v-for="emoji in COMMENT_REACTIONS"
                        :key="emoji"
                        type="button"
                        class="flex size-9 items-center justify-center rounded-md text-xl transition-transform hover:scale-125 hover:bg-accent"
                        :aria-label="`React with ${emoji}`"
                        @click="react(comment.id, emoji)"
                      >
                        {{ emoji }}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  v-if="comment.authorId === auth.user?.id"
                  type="button"
                  class="hover:text-foreground"
                  @click="editingId = comment.id"
                >
                  Edit
                </button>
                <button v-if="canManage(comment)" type="button" class="hover:text-destructive" @click="remove(comment)">
                  Delete
                </button>
              </div>
            </template>
          </div>
        </div>

        <div
          v-if="(comment.replies?.length ?? 0) > 0 || replyToId === comment.id"
          class="ml-4 space-y-3 border-l border-border pl-4 sm:ml-11"
        >
          <div v-for="reply in comment.replies ?? []" :key="reply.id" class="flex gap-3">
            <UserAvatar v-if="reply.author" :user="reply.author" size="sm" />
            <span v-else class="flex size-7 shrink-0 items-center justify-center bg-primary/10 text-primary">
              <Bot class="size-3.5" />
            </span>
            <div class="min-w-0 flex-1 space-y-1">
              <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span class="font-medium">{{ reply.author?.name ?? reply.guestAuthorName ?? 'Automation' }}</span>
                <span
                  v-if="!reply.authorId && reply.guestAuthorName"
                  class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >Guest</span>
                <span class="text-xs text-muted-foreground">{{ timeAgo(reply.createdAt) }}</span>
                <span v-if="reply.editedAt" class="text-xs text-muted-foreground">(edited)</span>
              </p>
              <CommentComposer
                v-if="editingId === reply.id"
                :members="members"
                :initial-value="reply.body"
                submit-label="Save"
                :allow-files="false"
                autofocus
                @submit="(body) => update(reply, body)"
                @cancel="editingId = null"
              />
              <template v-else>
                <MarkdownContent v-if="reply.body?.trim()" :source="reply.body" />
                <ul v-if="reply.attachments?.length" class="mt-2 flex flex-wrap gap-2">
                  <li v-for="file in reply.attachments" :key="file.id">
                    <button
                      type="button"
                      class="inline-flex max-w-xs items-center gap-2 border bg-muted/40 px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                      :title="file.fileName"
                      @click="openAttachment(file)"
                    >
                      <FileText class="size-3.5 shrink-0 text-primary" />
                      <span class="min-w-0 truncate font-medium">{{ file.fileName }}</span>
                      <span class="shrink-0 text-muted-foreground">{{ formatBytes(file.size) }}</span>
                      <Eye class="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                </ul>
                <div v-if="reply.reactions?.length" class="mt-1.5 flex flex-wrap gap-1">
                  <button
                    v-for="reaction in reply.reactions"
                    :key="reaction.emoji"
                    type="button"
                    class="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums"
                    :class="
                      reaction.userIds.includes(auth.user?.id ?? '')
                        ? 'border-primary/50 bg-primary/10 font-semibold text-primary'
                        : 'border-border bg-background text-muted-foreground hover:border-input hover:text-foreground'
                    "
                    :disabled="!editable"
                    :title="reactedBy(reaction.userIds)"
                    @click="react(reply.id, reaction.emoji)"
                  >
                    <span class="text-sm leading-none">{{ reaction.emoji }}</span>
                    {{ reaction.userIds.length }}
                  </button>
                  <Popover v-if="editable">
                    <PopoverTrigger as-child>
                      <button
                        type="button"
                        class="inline-flex h-6 items-center rounded-full border border-dashed border-border px-1.5 text-muted-foreground"
                        aria-label="Add a reaction"
                      >
                        <SmilePlus class="size-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" class="w-auto p-1">
                      <div class="flex gap-0.5">
                        <button
                          v-for="emoji in COMMENT_REACTIONS"
                          :key="emoji"
                          type="button"
                          class="flex size-9 items-center justify-center rounded-md text-xl hover:bg-accent"
                          @click="react(reply.id, emoji)"
                        >
                          {{ emoji }}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div class="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <Popover v-if="editable && !reply.reactions?.length">
                    <PopoverTrigger as-child>
                      <button type="button" class="inline-flex items-center gap-1 hover:text-foreground">
                        <SmilePlus class="size-3.5" /> React
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="start" class="w-auto p-1">
                      <div class="flex gap-0.5">
                        <button
                          v-for="emoji in COMMENT_REACTIONS"
                          :key="emoji"
                          type="button"
                          class="flex size-9 items-center justify-center rounded-md text-xl hover:bg-accent"
                          @click="react(reply.id, emoji)"
                        >
                          {{ emoji }}
                        </button>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <button
                    v-if="reply.authorId === auth.user?.id"
                    type="button"
                    class="hover:text-foreground"
                    @click="editingId = reply.id"
                  >
                    Edit
                  </button>
                  <button v-if="canManage(reply)" type="button" class="hover:text-destructive" @click="remove(reply)">
                    Delete
                  </button>
                </div>
              </template>
            </div>
          </div>

          <div v-if="replyToId === comment.id && editable" class="flex gap-3">
            <UserAvatar :user="auth.user" size="sm" class="hidden sm:flex" />
            <div class="min-w-0 flex-1">
              <CommentComposer
                ref="replyComposer"
                :members="members"
                placeholder="Write a reply…"
                submit-label="Reply"
                cancellable
                autofocus
                @submit="(body, files) => createReply(comment.id, body, files)"
                @cancel="replyToId = null"
              />
            </div>
          </div>
        </div>
      </li>
    </ol>

    <FilePreviewLightbox
      :open="previewOpen"
      :file-name="previewAttachment?.fileName ?? ''"
      :mime-type="previewAttachment?.mimeType ?? ''"
      :url="previewUrl"
      :office-embed-url="previewOfficeEmbed"
      :loading="previewLoading"
      @update:open="onPreviewOpen"
      @download="previewAttachment && attachmentsApi.download(previewAttachment)"
    />
  </div>
</template>
