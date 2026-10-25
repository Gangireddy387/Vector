<script setup lang="ts">
import { Bot, MessageSquare } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import MarkdownContent from '@/components/common/MarkdownContent.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { useConfirm } from '@/composables/useConfirm'
import { timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { Comment, UserSummary } from '@/types/models'
import { commentsApi } from '../../api/collaboration.api'
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
const composer = ref<InstanceType<typeof CommentComposer> | null>(null)

const load = async () => (comments.value = await commentsApi.list(props.issueId))
watch(() => [props.issueId, props.refreshKey], load, { immediate: true })

async function create(body: string) {
  try {
    comments.value.push(await commentsApi.create(props.issueId, body))
    composer.value?.reset()
    emit('changed')
  } catch (error) {
    composer.value?.done()
    toast.error(getErrorMessage(error))
  }
}

async function update(comment: Comment, body: string) {
  try {
    const updated = await commentsApi.update(comment.id, body)
    comments.value = comments.value.map((item) => (item.id === comment.id ? updated : item))
    editingId.value = null
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(comment: Comment) {
  if (!(await confirm({ title: 'Delete this comment?', confirmLabel: 'Delete', destructive: true }))) return
  await commentsApi.remove(comment.id)
  comments.value = comments.value.filter((item) => item.id !== comment.id)
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

    <EmptyState v-if="!comments.length" :icon="MessageSquare" title="No comments yet" description="Start the conversation — mention teammates with @." class="py-6" />

    <ol class="space-y-5">
      <li v-for="comment in [...comments].reverse()" :key="comment.id" class="flex gap-3">
        <UserAvatar v-if="comment.author" :user="comment.author" size="md" />
        <span v-else class="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary"><Bot class="size-4" /></span>
        <div class="min-w-0 flex-1 space-y-1">
          <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span class="font-medium">{{ comment.author?.name ?? 'Automation' }}</span>
            <span class="text-xs text-muted-foreground">{{ timeAgo(comment.createdAt) }}</span>
            <span v-if="comment.editedAt" class="text-xs text-muted-foreground">(edited)</span>
          </p>
          <CommentComposer
            v-if="editingId === comment.id"
            :members="members"
            :initial-value="comment.body"
            submit-label="Save"
            autofocus
            @submit="(body) => update(comment, body)"
            @cancel="editingId = null"
          />
          <template v-else>
            <MarkdownContent :source="comment.body" />
            <div class="flex gap-3 text-xs text-muted-foreground">
              <button v-if="comment.authorId === auth.user?.id" type="button" class="hover:text-foreground" @click="editingId = comment.id">Edit</button>
              <button v-if="comment.authorId === auth.user?.id || isAdmin" type="button" class="hover:text-destructive" @click="remove(comment)">
                Delete
              </button>
            </div>
          </template>
        </div>
      </li>
    </ol>
  </div>
</template>
