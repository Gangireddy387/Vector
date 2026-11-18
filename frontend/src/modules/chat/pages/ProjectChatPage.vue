<script setup lang="ts">
import { format, isToday, isYesterday } from 'date-fns'
import { ArrowRight, Bot, ClipboardList, Hash, MessageCircle } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import EmptyState from '@/components/common/EmptyState.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirm } from '@/composables/useConfirm'
import { useDevice } from '@/composables/useDevice'
import { useProjectRealtime } from '@/composables/useProjectRealtime'
import { getErrorMessage } from '@/lib/http'
import { toPlainText } from '@/lib/markdown'
import { useSocketEvents } from '@/lib/socket-events'
import { playSound } from '@/lib/sounds'
import { useAuthStore } from '@/modules/auth/auth.store'
import { usersApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { UserSummary } from '@/types/models'
import { type AssistantCommand, type ChatIssueRef, type ChatMessage, type ChatReaction, type ChatSendPayload, chatApi } from '../chat.api'
import ChatComposer from '../components/ChatComposer.vue'
import ChatMessageItem from '../components/ChatMessageItem.vue'

/** Embedded (e.g. in the Inbox) the project and message come from props and the side rail is left out. */
const props = defineProps<{ projectId?: string; messageId?: string | null; embedded?: boolean }>()

const route = useRoute()
const auth = useAuthStore()
const projects = useProjectsStore()
const confirm = useConfirm()
const { isDesktop } = useDevice()

const projectId = computed(() => props.projectId ?? (route.params.projectId as string))
const targetMessage = computed(() => props.messageId ?? (typeof route.query.message === 'string' ? route.query.message : null))
const project = computed(() => projects.details[projectId.value] ?? null)
const isAdmin = computed(() => project.value?.myRole === 'admin')
/** Viewers can read the thread; posting needs member+. */
const canPost = computed(() => projects.canEdit(projectId.value))

/** Top-level posts and their replies live in one list; threads are built in the view. */
const messages = ref<ChatMessage[]>([])
const commands = ref<AssistantCommand[]>([])
const members = ref<UserSummary[]>([])
const hasMore = ref(false)
const isLoading = ref(true)
const loadError = ref<string | null>(null)
const isLoadingOlder = ref(false)
const isSending = ref(false)
const failedSend = ref<ChatSendPayload | null>(null)
const threadSearch = ref('')
const replyTo = ref<ChatMessage | null>(null)
const highlightedId = ref<string | null>(null)
const scroller = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof ChatComposer> | null>(null)

const posts = computed(() => messages.value.filter((message) => !message.parentId))
const repliesOf = computed(() => {
  const map = new Map<string, ChatMessage[]>()
  for (const message of messages.value) {
    if (!message.parentId) continue
    const list = map.get(message.parentId)
    if (list) list.push(message)
    else map.set(message.parentId, [message])
  }
  for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return map
})

const replyToPreview = computed(() => {
  if (!replyTo.value) return null
  const author = replyTo.value.author?.name ?? (replyTo.value.kind === 'bot' ? 'Assistant' : 'Someone')
  const snippet =
    toPlainText(replyTo.value.body, 140) ||
    replyTo.value.files?.[0]?.fileName ||
    'Message'
  return {
    id: replyTo.value.id,
    authorName: author,
    snippet,
  }
})

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

function mergePage(page: { messages: ChatMessage[]; replies: ChatMessage[] }, mode: 'replace' | 'prepend') {
  const incoming = [...page.messages, ...page.replies]
  if (mode === 'replace') {
    messages.value = incoming
    return
  }
  const seen = new Set(messages.value.map((message) => message.id))
  const older = incoming.filter((message) => !seen.has(message.id))
  messages.value = [...older, ...messages.value]
}

async function load() {
  isLoading.value = true
  loadError.value = null
  if (props.embedded) void projects.fetchProject(projectId.value).catch(() => {})
  try {
    const [page, people] = await Promise.all([chatApi.list(projectId.value), usersApi.search({ projectId: projectId.value })])
    mergePage(page, 'replace')
    hasMore.value = page.hasMore
    commands.value = page.commands
    members.value = people.filter((person) => person.id !== auth.user?.id)
  } catch (error) {
    loadError.value = getErrorMessage(error)
  } finally {
    isLoading.value = false
  }
  const target = targetMessage.value
  if (target && messages.value.some((message) => message.id === target)) await focusMessage(target)
  else if (!loadError.value) await scrollToBottom()
}
watch(projectId, load, { immediate: true })
watch(targetMessage, (id) => {
  if (id && !isLoading.value && messages.value.some((message) => message.id === id)) void focusMessage(id)
})

async function loadOlder() {
  const first = posts.value[0]
  if (!first || isLoadingOlder.value) return
  isLoadingOlder.value = true
  const el = scroller.value
  const previousHeight = el?.scrollHeight ?? 0
  try {
    const page = await chatApi.list(projectId.value, { before: first.createdAt })
    mergePage(page, 'prepend')
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

function applyReactions(messageId: string, reactions: ChatReaction[]) {
  messages.value = messages.value.map((item) => (item.id === messageId ? { ...item, reactions } : item))
}

async function send(payload: { body: string; fileIds: string[] }) {
  isSending.value = true
  failedSend.value = null
  const request: ChatSendPayload = {
    body: payload.body,
    fileIds: payload.fileIds,
    ...(replyTo.value ? { parentId: replyTo.value.id } : {}),
  }
  try {
    const { message, reply } = await chatApi.send(projectId.value, request)
    upsert(message)
    if (reply) upsert(reply)
    replyTo.value = null
    await scrollToBottom(true)
  } catch (error) {
    failedSend.value = request
    toast.error(getErrorMessage(error))
  } finally {
    isSending.value = false
  }
}

function retryFailedSend() {
  if (!failedSend.value) return
  const payload = failedSend.value
  failedSend.value = null
  if (payload.parentId) {
    const parent = messages.value.find((message) => message.id === payload.parentId)
    if (parent) replyTo.value = parent
  }
  void send({ body: payload.body, fileIds: payload.fileIds ?? [] })
}

/** Quote uses the same reply bar as Reply — never dumps raw markdown / mention ids into the composer. */
async function quoteMessage(message: ChatMessage) {
  await startReply(message)
}

async function startReply(message: ChatMessage) {
  const parent = message.parentId ? messages.value.find((item) => item.id === message.parentId) ?? message : message
  replyTo.value = parent
  composer.value?.setText('')
  await nextTick()
  composer.value?.focus()
}

async function copyMessageLink(message: ChatMessage) {
  const url = new URL(window.location.href)
  url.searchParams.set('message', message.parentId ?? message.id)
  try {
    await navigator.clipboard.writeText(url.toString())
    toast.success('Message link copied')
  } catch {
    toast.error('Could not copy link')
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
  const replyCount = message.parentId ? 0 : (repliesOf.value.get(message.id)?.length ?? 0)
  const ok = await confirm({
    title: message.parentId ? 'Delete this reply?' : 'Delete this message?',
    description: message.parentId
      ? 'It will disappear for everyone in this project chat.'
      : `It will also disappear from the follow-up record of any task it mentions.${replyCount ? ` Its ${replyCount} ${replyCount === 1 ? 'reply' : 'replies'} will be removed too.` : ''}`,
    confirmLabel: 'Delete',
    destructive: true,
  })
  if (!ok) return
  try {
    await chatApi.remove(message.id)
    if (replyTo.value?.id === message.id) replyTo.value = null
    messages.value = messages.value.filter((item) => item.id !== message.id && item.parentId !== message.id)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function react(message: ChatMessage, emoji: string) {
  try {
    const result = await chatApi.react(message.id, emoji)
    applyReactions(result.messageId, result.reactions)
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

const useCommand = (command: AssistantCommand) => {
  replyTo.value = null
  composer.value?.setText(command.name === 'status' ? '/status ' : `/${command.name}`)
}

// Realtime: teammates' messages arrive without refreshing.
useProjectRealtime(projectId, () => {})
const onIncoming = async (message: ChatMessage) => {
  const stick = nearBottom()
  const isNew = !messages.value.some((item) => item.id === message.id)
  upsert(message)
  if (isNew && message.kind === 'user' && message.authorId !== auth.user?.id) playSound('message', { id: message.id, quiet: true })
  if (stick) await scrollToBottom(true)
}
const onDeleted = ({ id }: { id: string; projectId?: string }) => {
  if (replyTo.value?.id === id) replyTo.value = null
  messages.value = messages.value.filter((item) => item.id !== id && item.parentId !== id)
}
const onReactions = (payload: { messageId: string; projectId?: string; reactions: ChatReaction[] }) => {
  applyReactions(payload.messageId, payload.reactions)
}
/** Only this project's chat (the browser can follow several projects at once). */
const here = <T extends { projectId?: string }>(handler: (payload: T) => unknown) => (payload: T) => {
  if (!payload.projectId || payload.projectId === projectId.value) void handler(payload)
}
useSocketEvents({
  'chat:message': here(onIncoming),
  'chat:updated': here(upsert),
  'chat:deleted': here(onDeleted),
  'chat:reactions': here(onReactions),
})

// Day separators and consecutive-message grouping for top-level posts only.
const dayLabel = (date: Date) => (isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, d MMMM yyyy'))
const filteredPosts = computed(() => {
  const term = threadSearch.value.trim().toLowerCase()
  if (!term) return posts.value
  return posts.value.filter((message) => {
    const author = message.author?.name ?? ''
    const inPost = `${message.body} ${author}`.toLowerCase().includes(term)
    const inReplies = (repliesOf.value.get(message.id) ?? []).some((reply) => {
      const replyAuthor = reply.author?.name ?? ''
      return `${reply.body} ${replyAuthor}`.toLowerCase().includes(term)
    })
    return inPost || inReplies
  })
})

const rows = computed(() =>
  filteredPosts.value.map((message, index) => {
    const previous = filteredPosts.value[index - 1]
    const at = new Date(message.createdAt)
    const newDay = !previous || new Date(previous.createdAt).toDateString() !== at.toDateString()
    const grouped =
      !newDay &&
      previous!.kind === message.kind &&
      previous!.authorId === message.authorId &&
      message.kind === 'user' &&
      at.getTime() - new Date(previous!.createdAt).getTime() < 5 * 60 * 1000
    const replies = repliesOf.value.get(message.id) ?? []
    return { message, grouped, day: newDay ? dayLabel(at) : null, replies }
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
  <div class="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
    <section class="flex min-w-0 flex-1 flex-col">
      <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto pb-3">
        <!-- Stick the thread to the bottom so a short chat sits above the composer, not under a tall empty gap. -->
        <div class="flex min-h-full flex-col justify-end">
          <div v-if="isLoading" class="space-y-4 p-4" aria-busy="true" aria-label="Loading work chat">
            <div v-for="index in 5" :key="index" class="flex gap-3">
              <Skeleton class="size-9 shrink-0 rounded-full" />
              <div class="flex-1 space-y-2"><Skeleton class="h-3 w-40" /><Skeleton class="h-4 w-3/4" /></div>
            </div>
          </div>

          <EmptyState
            v-else-if="loadError"
            :icon="Hash"
            title="Work chat did not load"
            :description="loadError"
            class="py-10"
          >
            <Button variant="outline" @click="load">Try again</Button>
          </EmptyState>

          <EmptyState
            v-else-if="!posts.length"
            :icon="Hash"
            title="Start the work chat"
            description="Talk about this project’s tasks here. Mention a key like VEC-12 and it lands on that task. Private DMs and team channels live under Messages — a separate place."
            class="py-10"
          >
            <div class="flex flex-wrap justify-center gap-2">
              <Button variant="outline" size="sm" @click="useCommand({ name: 'help', usage: '/help', description: '' })"><Bot /> What can the assistant do?</Button>
              <Button variant="outline" size="sm" as-child>
                <RouterLink :to="{ name: 'project-standup', params: { projectId } }"><ClipboardList /> Today’s standup</RouterLink>
              </Button>
              <Button
                v-if="auth.hasFeature('directMessages') || auth.hasFeature('teamChat')"
                variant="ghost"
                size="sm"
                as-child
              >
                <RouterLink :to="{ name: 'messages' }"><MessageCircle /> Open Messages</RouterLink>
              </Button>
            </div>
          </EmptyState>

          <template v-else>
            <div v-if="!embedded" class="sticky top-0 z-10 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur">
              <input
                v-model="threadSearch"
                type="search"
                class="h-8 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Search in this chat"
                aria-label="Search in this chat"
              />
            </div>
            <div class="flex justify-center py-3">
              <Button v-if="hasMore && !threadSearch" variant="ghost" size="sm" :loading="isLoadingOlder" @click="loadOlder">Load earlier messages</Button>
              <p v-else-if="!threadSearch" class="text-xs text-muted-foreground">This is the beginning of the {{ project?.name }} chat.</p>
              <p v-else-if="!rows.length" class="text-xs text-muted-foreground">No messages match “{{ threadSearch }}”.</p>
            </div>
            <template v-for="row in rows" :key="row.message.id">
              <div v-if="row.day" class="relative my-3 flex items-center px-4" role="separator">
                <span class="h-px flex-1 bg-border" />
                <span class="mx-3 text-xs font-medium text-muted-foreground">{{ row.day }}</span>
                <span class="h-px flex-1 bg-border" />
              </div>
              <ChatMessageItem
                :message="row.message"
                :project-id="projectId"
                :members="members"
                :grouped="row.grouped"
                :highlighted="highlightedId === row.message.id"
                :can-post="canPost"
                :can-edit="row.message.kind === 'user' && row.message.authorId === auth.user?.id"
                :can-delete="(row.message.kind === 'user' && row.message.authorId === auth.user?.id) || isAdmin"
                @edit="(body) => edit(row.message, body)"
                @remove="remove(row.message)"
                @use-command="useCommand"
                @quote="quoteMessage(row.message)"
                @copy-link="copyMessageLink(row.message)"
                @reply="startReply(row.message)"
                @react="(emoji) => react(row.message, emoji)"
              />
              <div v-if="row.replies.length" class="border-l border-border/70 ml-8 sm:ml-12">
                <ChatMessageItem
                  v-for="reply in row.replies"
                  :key="reply.id"
                  reply
                  :message="reply"
                  :project-id="projectId"
                  :members="members"
                  :grouped="false"
                  :highlighted="highlightedId === reply.id"
                  :can-post="canPost"
                  :can-edit="reply.kind === 'user' && reply.authorId === auth.user?.id"
                  :can-delete="(reply.kind === 'user' && reply.authorId === auth.user?.id) || isAdmin"
                  @edit="(body) => edit(reply, body)"
                  @remove="remove(reply)"
                  @use-command="useCommand"
                  @quote="quoteMessage(reply)"
                  @copy-link="copyMessageLink(reply)"
                  @react="(emoji) => react(reply, emoji)"
                />
              </div>
            </template>
          </template>
        </div>
      </div>

      <div class="shrink-0 border-t bg-background px-4 pt-3 pb-3">
        <div v-if="!embedded && (!isDesktop || discussedTasks.length)" class="mb-2 flex flex-wrap items-center gap-1.5">
          <RouterLink
            v-if="!isDesktop"
            :to="{ name: 'project-standup', params: { projectId } }"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 text-[11.5px] font-medium hover:bg-accent"
          >
            <ClipboardList class="size-3.5" /> Standup
          </RouterLink>
          <RouterLink
            v-for="entry in discussedTasks.slice(0, isDesktop ? 6 : 4)"
            :key="entry.issue.id"
            :to="{ name: 'issue', params: { issueKey: entry.issue.key } }"
            class="inline-flex h-7 max-w-[9rem] items-center gap-1 rounded-md border border-border px-2 text-[11.5px] font-medium hover:bg-accent"
          >
            <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: entry.issue.status?.color ?? 'var(--muted-foreground)' }" />
            <span class="truncate font-mono">{{ entry.issue.key }}</span>
          </RouterLink>
        </div>
        <div v-if="failedSend" class="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span class="min-w-0 flex-1">Last message didn’t send.</span>
          <Button size="sm" variant="outline" @click="retryFailedSend">Retry</Button>
          <Button size="sm" variant="ghost" @click="failedSend = null">Dismiss</Button>
        </div>
        <ChatComposer
          v-if="canPost"
          ref="composer"
          :project-id="projectId"
          :members="members"
          :commands="commands"
          :disabled="isSending"
          :reply-to="replyToPreview"
          @submit="send"
          @cancel-reply="replyTo = null"
        />
        <p v-else class="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-center text-xs text-muted-foreground" role="status">
          You’re a viewer on this project — you can read chat, but only members can post.
        </p>
      </div>
    </section>

    <aside v-if="!embedded" class="flex max-h-56 shrink-0 flex-col gap-4 overflow-y-auto border-t bg-muted/20 p-3 lg:max-h-none lg:w-72 lg:border-t-0 lg:border-l lg:p-4">
      <section>
        <h2 class="mb-2 text-xs font-medium text-muted-foreground">Daily standup</h2>
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
        <h2 class="mb-2 text-xs font-medium text-muted-foreground">Tasks in this conversation</h2>
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
        <h2 class="mb-2 text-xs font-medium text-muted-foreground">Ask the assistant</h2>
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
