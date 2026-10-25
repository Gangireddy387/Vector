<script setup lang="ts">
import { format, isToday, isYesterday } from 'date-fns'
import { ArrowRight, Bot, ClipboardList, MessagesSquare } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'
import { usersApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { UserSummary } from '@/types/models'
import { type AssistantCommand, type ChatIssueRef, type ChatMessage, chatApi } from '../chat.api'
import ChatComposer from '../components/ChatComposer.vue'
import ChatMessageItem from '../components/ChatMessageItem.vue'

const route = useRoute()
const auth = useAuthStore()
const projects = useProjectsStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const projectId = computed(() => route.params.projectId as string)
const project = computed(() => projects.details[projectId.value] ?? null)
const isAdmin = computed(() => project.value?.myRole === 'admin')

const messages = ref<ChatMessage[]>([])
const commands = ref<AssistantCommand[]>([])
const members = ref<UserSummary[]>([])
const hasMore = ref(false)
const isLoading = ref(true)
const isLoadingOlder = ref(false)
const isSending = ref(false)
const highlightedId = ref<string | null>(null)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)

const nearBottom = () => {
  const el = scroller.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 160
}
async function scrollToBottom(smooth = false) {
  await nextTick()
  scroller.value?.scrollTo({ top: scroller.value.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
}

async function focusMessage(id: string) {
  await nextTick()
  const element = document.getElementById(`message-${id}`)
  if (!element) return
  element.scrollIntoView({ block: 'center' })
  highlightedId.value = id
  window.setTimeout(() => highlightedId.value === id && (highlightedId.value = null), 2600)
}

async function load() {
  isLoading.value = true
  try {
    const [page, people] = await Promise.all([chatApi.list(projectId.value), usersApi.search({ projectId: projectId.value })])
    messages.value = page.messages
    hasMore.value = page.hasMore
    commands.value = page.commands
    members.value = people.filter((person) => person.id !== auth.user?.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoading.value = false
  }
  const target = typeof route.query.message === 'string' ? route.query.message : null
  if (target && messages.value.some((message) => message.id === target)) await focusMessage(target)
  else await scrollToBottom()
}
watch(projectId, load, { immediate: true })

async function loadOlder() {
  const first = messages.value[0]
  if (!first || isLoadingOlder.value) return
  isLoadingOlder.value = true
  const el = scroller.value
  const previousHeight = el?.scrollHeight ?? 0
  try {
    const page = await chatApi.list(projectId.value, { before: first.createdAt })
    messages.value = [...page.messages, ...messages.value]
    hasMore.value = page.hasMore
    await nextTick()
    if (el) el.scrollTop = el.scrollHeight - previousHeight
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isLoadingOlder.value = false
  }
}

function upsert(message: ChatMessage) {
  if (message.projectId !== projectId.value) return
  const index = messages.value.findIndex((item) => item.id === message.id)
  if (index >= 0) messages.value.splice(index, 1, message)
  else messages.value.push(message)
}

async function send(body: string) {
  isSending.value = true
  try {
    const { message, reply } = await chatApi.send(projectId.value, body)
    upsert(message)
    if (reply) upsert(reply)
    await scrollToBottom(true)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
  }
}

async function edit(message: ChatMessage, body: string) {
  try {
    upsert(await chatApi.edit(message.id, body))
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(message: ChatMessage) {
  const ok = await confirm({ title: 'Delete this message?', description: 'It will also disappear from the follow-up record of any task it mentions.', confirmLabel: 'Delete', destructive: true })
  if (!ok) return
  try {
    await chatApi.remove(message.id)
    messages.value = messages.value.filter((item) => item.id !== message.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const useCommand = (command: AssistantCommand) => composer.value?.setText(command.name === 'status' ? '/status ' : `/${command.name}`)

// Realtime: teammates' messages arrive without refreshing.
useProjectRealtime(projectId, () => {})
const onIncoming = async (message: ChatMessage) => {
  const stick = nearBottom()
  upsert(message)
  if (stick) await scrollToBottom(true)
}
const onDeleted = ({ id }: { id: string }) => (messages.value = messages.value.filter((item) => item.id !== id))
onMounted(() => {
  const socket = getSocket()
  socket?.on('chat:message', onIncoming)
  socket?.on('chat:updated', upsert)
  socket?.on('chat:deleted', onDeleted)
})
onBeforeUnmount(() => {
  const socket = getSocket()
  socket?.off('chat:message', onIncoming)
  socket?.off('chat:updated', upsert)
  socket?.off('chat:deleted', onDeleted)
})

// Day separators and consecutive-message grouping.
const dayLabel = (date: Date) => (isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, d MMMM yyyy'))
const rows = computed(() =>
  messages.value.map((message, index) => {
    const previous = messages.value[index - 1]
    const at = new Date(message.createdAt)
    const newDay = !previous || new Date(previous.createdAt).toDateString() !== at.toDateString()
    const grouped =
      !newDay &&
      previous!.kind === message.kind &&
      previous!.authorId === message.authorId &&
      message.kind === 'user' &&
      at.getTime() - new Date(previous!.createdAt).getTime() < 5 * 60 * 1000
    return { message, grouped, day: newDay ? dayLabel(at) : null }
  }),
)

/** Tasks talked about in the loaded conversation, most recently mentioned first. */
const discussedTasks = computed(() => {
  const tasks = new Map<string, { issue: ChatIssueRef; count: number; lastAt: string }>()
  for (const message of messages.value) {
    if (message.kind !== 'user') continue
    for (const issue of message.issues) {
      const entry = tasks.get(issue.id) ?? { issue, count: 0, lastAt: message.createdAt }
      entry.count += 1
      entry.lastAt = message.createdAt
      entry.issue = issue
      tasks.set(issue.id, entry)
    }
  }
  return [...tasks.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt)).slice(0, 12)
})
</script>

<template>
  <div class="flex min-h-0" :class="isDesktop ? 'h-full' : 'h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]'">
    <section class="flex min-w-0 flex-1 flex-col">
      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto pb-3">
        <div v-if="isLoading" class="space-y-4 p-4">
          <div v-for="index in 5" :key="index" class="flex gap-3">
            <Skeleton class="size-9 shrink-0" />
            <div class="flex-1 space-y-2"><Skeleton class="h-3 w-40" /><Skeleton class="h-4 w-3/4" /></div>
          </div>
        </div>

        <EmptyState
          v-else-if="!messages.length"
          :icon="MessagesSquare"
          title="Start the conversation"
          description="Talk about the work here. Mention a task like VEC-12 and the message is recorded on that task, so follow-ups are never lost. Type / to ask the assistant."
          class="h-full"
        >
          <Button variant="outline" size="sm" @click="useCommand({ name: 'help', usage: '/help', description: '' })"><Bot /> What can the assistant do?</Button>
        </EmptyState>

        <template v-else>
          <div class="flex justify-center py-3">
            <Button v-if="hasMore" variant="ghost" size="sm" :loading="isLoadingOlder" @click="loadOlder">Load earlier messages</Button>
            <p v-else class="text-xs text-muted-foreground">This is the beginning of the {{ project?.name }} chat.</p>
          </div>
          <template v-for="row in rows" :key="row.message.id">
            <div v-if="row.day" class="relative my-3 flex items-center px-4" role="separator">
              <span class="h-px flex-1 bg-border" />
              <span class="mx-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{{ row.day }}</span>
              <span class="h-px flex-1 bg-border" />
            </div>
            <ChatMessageItem
              :message="row.message"
              :project-id="projectId"
              :grouped="row.grouped"
              :highlighted="highlightedId === row.message.id"
              :can-edit="row.message.kind === 'user' && row.message.authorId === auth.user?.id"
              :can-delete="(row.message.kind === 'user' && row.message.authorId === auth.user?.id) || isAdmin"
              @edit="(body) => edit(row.message, body)"
              @remove="remove(row.message)"
              @use-command="useCommand"
            />
          </template>
        </template>
      </div>

      <div class="shrink-0 border-t bg-background px-4 pt-3 pb-3">
        <ChatComposer ref="composer" :project-id="projectId" :members="members" :commands="commands" :disabled="isSending" @submit="send" />
      </div>
    </section>

    <aside v-if="isDesktop" class="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l bg-muted/20 p-4 xl:flex">
      <section>
        <h2 class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Daily standup</h2>
        <RouterLink
          :to="{ name: 'project-standup', params: { projectId } }"
          class="flex items-center gap-3 border bg-card p-3 text-sm shadow-soft transition-colors hover:border-primary/40"
        >
          <span class="flex size-8 items-center justify-center bg-primary/10 text-primary"><ClipboardList class="size-4" /></span>
          <span class="min-w-0 flex-1">
            <span class="block font-medium">Today's standup</span>
            <span class="block text-xs text-muted-foreground">Post your update and see the team's</span>
          </span>
          <ArrowRight class="size-4 text-muted-foreground" />
        </RouterLink>
      </section>

      <section>
        <h2 class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Tasks in this conversation</h2>
        <ul v-if="discussedTasks.length" class="space-y-1">
          <li v-for="entry in discussedTasks" :key="entry.issue.id">
            <RouterLink :to="{ name: 'issue', params: { issueKey: entry.issue.key } }" class="flex items-center gap-2 px-2 py-1.5 text-sm transition-colors hover:bg-accent/60">
              <span class="size-2 shrink-0 rounded-full" :style="{ backgroundColor: entry.issue.status?.color ?? 'var(--muted-foreground)' }" :title="entry.issue.status?.name" />
              <span class="shrink-0 font-mono text-xs font-semibold">{{ entry.issue.key }}</span>
              <span class="min-w-0 flex-1 truncate text-muted-foreground">{{ entry.issue.title }}</span>
              <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums" :title="`${entry.count} messages`">{{ entry.count }}</span>
            </RouterLink>
          </li>
        </ul>
        <p v-else class="text-xs leading-relaxed text-muted-foreground">Mention a task key in a message and it shows up here, and on the task's Follow-ups tab.</p>
      </section>

      <section>
        <h2 class="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Ask the assistant</h2>
        <ul class="space-y-1">
          <li v-for="command in commands" :key="command.name">
            <button type="button" class="w-full px-2 py-1.5 text-left transition-colors hover:bg-accent/60" @click="useCommand(command)">
              <span class="block font-mono text-xs font-semibold text-primary">{{ command.usage }}</span>
              <span class="block text-xs text-muted-foreground">{{ command.description }}</span>
            </button>
          </li>
        </ul>
      </section>
    </aside>
  </div>
</template>
