<script setup lang="ts">
import { format } from 'date-fns'
import { Bot, Pencil, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { AssistantCommand, ChatMessage } from '../chat.api'
import AssistantCard from './AssistantCard.vue'

const props = defineProps<{ message: ChatMessage; projectId: string; canEdit: boolean; canDelete: boolean; grouped: boolean; highlighted: boolean }>()
const emit = defineEmits<{ edit: [body: string]; remove: []; useCommand: [command: AssistantCommand] }>()

const isBot = computed(() => props.message.kind === 'bot')
const issueKeys = computed(() => props.message.issues.map((issue) => issue.key))
const time = computed(() => format(new Date(props.message.createdAt), 'HH:mm'))

/** For rich assistant replies the card carries the details, so only the opening sentence is shown as text. */
const body = computed(() => {
  const meta = props.message.meta
  if (!isBot.value || !meta) return props.message.body
  if (meta.type === 'standup_draft') return props.message.body.split('\n\n')[0]
  if (meta.type === 'issue_status' && meta.issues.length) return ''
  if (meta.type === 'help') return props.message.body.split('\n')[0]
  return props.message.body
})

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
    class="group relative flex gap-3 px-4 transition-colors hover:bg-muted/40"
    :class="[grouped ? 'py-0.5' : 'pt-3 pb-0.5', highlighted && 'bg-primary/8 ring-1 ring-primary/30 ring-inset']"
  >
    <div class="w-9 shrink-0">
      <template v-if="!grouped">
        <span v-if="isBot" class="flex size-9 items-center justify-center bg-brand text-white shadow-soft"><Bot class="size-5" /></span>
        <UserAvatar v-else :user="message.author" size="md" class="size-9" />
      </template>
      <span v-else class="hidden pt-1 text-right text-[10px] leading-5 text-muted-foreground tabular-nums group-hover:block">{{ time }}</span>
    </div>

    <div class="min-w-0 flex-1">
      <p v-if="!grouped" class="flex flex-wrap items-baseline gap-x-2">
        <span class="text-sm font-semibold">{{ isBot ? 'Vector Assistant' : message.author?.name ?? 'Former member' }}</span>
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
      </template>
    </div>

    <div v-if="!isEditing && (canEdit || canDelete)" class="absolute top-1 right-3 hidden border bg-card shadow-soft group-focus-within:flex group-hover:flex">
      <Button v-if="canEdit" variant="ghost" size="icon-sm" aria-label="Edit message" @click="startEditing"><Pencil /></Button>
      <Button v-if="canDelete" variant="ghost" size="icon-sm" aria-label="Delete message" class="text-destructive" @click="emit('remove')"><Trash2 /></Button>
    </div>
  </article>
</template>
