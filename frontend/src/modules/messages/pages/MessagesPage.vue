<script setup lang="ts">
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { ArrowLeft, Building2, EllipsisVertical, Eraser, MessageCirclePlus, MessagesSquare, Search, UsersRound } from 'lucide-vue-next'
import { computed, onMounted, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { getErrorMessage } from '@/lib/http'
import { timeAgo } from '@/lib/format'
import { useAuthStore } from '@/modules/auth/auth.store'
import { usersApi } from '@/modules/projects/projects.api'
import type { UserSummary } from '@/types/models'
import ConversationThread from '../components/ConversationThread.vue'
import { type ConversationSummary, messagesApi } from '../messages.api'
import { useMessagesStore } from '../messages.store'

/** Direct messages and team/department chats: the conversation list on the left, the open chat on the right. */
const props = defineProps<{ conversationId?: string }>()

const router = useRouter()
const auth = useAuthStore()
const store = useMessagesStore()
const { isDesktop } = useDevice()
const search = ref('')
const thread = useTemplateRef<InstanceType<typeof ConversationThread>>('thread')

const canDirect = computed(() => auth.hasFeature('directMessages'))
const canGroup = computed(() => auth.hasFeature('teamChat'))

onMounted(() => store.load().catch((error) => toast.error(getErrorMessage(error))))

const selected = computed(() => store.conversations?.find((conversation) => conversation.id === props.conversationId) ?? null)
watch(
  () => props.conversationId ?? null,
  (id) => (store.openId = id),
  { immediate: true },
)
onBeforeUnmount(() => (store.openId = null))

const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return (store.conversations ?? []).filter((conversation) => !term || `${conversation.title} ${conversation.subtitle}`.toLowerCase().includes(term))
})

const open = (conversation: ConversationSummary) => router.push({ name: 'messages', params: { conversationId: conversation.id } })

const listTime = (value: string) => {
  const date = parseISO(value)
  return isToday(date) ? format(date, 'HH:mm') : isYesterday(date) ? 'Yesterday' : format(date, 'd/M/yy')
}
const preview = (conversation: ConversationSummary) => {
  const last = conversation.lastMessage
  if (!last) return conversation.kind === 'direct' ? 'Say hello 👋' : conversation.subtitle
  if (last.deleted) return 'This message was deleted'
  const who = last.author?.id === auth.user?.id ? 'You' : conversation.kind === 'direct' ? '' : (last.author?.name.split(' ')[0] ?? '')
  return who ? `${who}: ${last.body}` : last.body
}
const presence = (conversation: ConversationSummary) => {
  if (conversation.kind !== 'direct') return `${conversation.memberCount ?? 0} people · ${conversation.subtitle}`
  if (conversation.person?.isOnline) return 'online'
  return conversation.person?.lastSeenAt ? `last seen ${timeAgo(conversation.person.lastSeenAt)}` : (conversation.subtitle || 'Direct message')
}

// --- New direct chat ---------------------------------------------------------
const isPickerOpen = ref(false)
const people = ref<UserSummary[] | null>(null)
const peopleSearch = ref('')
const isOpening = ref<string | null>(null)

async function openPicker() {
  isPickerOpen.value = true
  peopleSearch.value = ''
  if (!people.value) people.value = (await usersApi.search({}).catch(() => [])).filter((person) => person.id !== auth.user?.id)
}
const pickable = computed(() => {
  const term = peopleSearch.value.trim().toLowerCase()
  return (people.value ?? []).filter((person) => !term || `${person.name} ${person.email} ${person.title ?? ''}`.toLowerCase().includes(term))
})

async function startChat(person: UserSummary) {
  isOpening.value = person.id
  try {
    const conversation = await messagesApi.openDirect(person.id)
    store.upsert(conversation)
    isPickerOpen.value = false
    await open(conversation)
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isOpening.value = null
  }
}
</script>

<template>
  <div class="flex h-full w-full flex-col" :class="isDesktop ? 'p-5' : ''">
    <div class="flex min-h-0 flex-1 overflow-hidden bg-card" :class="isDesktop && 'border border-border/80 shadow-soft'">
      <!-- Conversation list -->
      <aside
        v-if="isDesktop || !selected"
        class="flex min-h-0 flex-col border-r border-border/70"
        :class="isDesktop ? 'w-[22rem] shrink-0 xl:w-[26rem]' : 'w-full'"
      >
        <header class="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3">
          <h1 class="text-xl font-bold tracking-tight">Messages</h1>
          <Button v-if="canDirect" variant="ghost" size="icon-sm" title="New chat" aria-label="New chat" @click="openPicker"><MessageCirclePlus /></Button>
        </header>
        <div class="shrink-0 px-3 pb-2">
          <div class="relative">
            <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input v-model="search" class="rounded-lg bg-muted/50 pl-9" placeholder="Search chats" aria-label="Search chats" />
          </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div v-if="store.conversations === null" class="space-y-2 p-3">
            <Skeleton v-for="index in 6" :key="index" class="h-14 w-full" />
          </div>
          <div v-else-if="!filtered.length" class="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <span class="flex size-12 items-center justify-center bg-primary/10 text-primary"><MessagesSquare class="size-6" /></span>
            <p class="text-sm font-medium">{{ search ? `No chats match “${search}”` : 'No chats yet' }}</p>
            <p class="text-xs text-muted-foreground">
              {{ canDirect ? 'Start a private chat with anyone in your organization.' : '' }}
              {{ canGroup ? 'Team and department chats appear once you are part of a team.' : '' }}
            </p>
            <Button v-if="canDirect && !search" variant="brand" size="sm" @click="openPicker"><MessageCirclePlus /> New chat</Button>
          </div>
          <button
            v-for="conversation in filtered"
            v-else
            :key="conversation.id"
            type="button"
            class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
            :class="selected?.id === conversation.id ? 'bg-primary/10' : 'hover:bg-muted/60'"
            @click="open(conversation)"
          >
            <span class="relative shrink-0">
              <UserAvatar v-if="conversation.kind === 'direct'" :user="conversation.person" size="lg" class="size-12 text-base" />
              <span v-else class="flex size-12 items-center justify-center rounded-full text-white" :class="conversation.kind === 'team' ? 'bg-sky-500' : 'bg-violet-500'">
                <UsersRound v-if="conversation.kind === 'team'" class="size-5" />
                <Building2 v-else class="size-5" />
              </span>
              <span v-if="conversation.person?.isOnline" class="absolute right-0 bottom-0 size-3.5 rounded-full bg-[#25d366] ring-2 ring-card" />
            </span>
            <span class="min-w-0 flex-1 border-b border-border/50 pb-2.5">
              <span class="flex items-baseline gap-2">
                <span class="min-w-0 flex-1 truncate text-[15px]" :class="conversation.unread ? 'font-semibold' : 'font-medium'">{{ conversation.title }}</span>
                <span class="shrink-0 text-[11px]" :class="conversation.unread ? 'font-semibold text-[#00a884]' : 'text-muted-foreground'">
                  {{ conversation.lastMessage ? listTime(conversation.lastMessage.createdAt) : '' }}
                </span>
              </span>
              <span class="mt-0.5 flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-[13px]" :class="conversation.unread ? 'text-foreground' : 'text-muted-foreground'">{{ preview(conversation) }}</span>
                <span v-if="conversation.unread" class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white tabular-nums">
                  {{ conversation.unread > 99 ? '99+' : conversation.unread }}
                </span>
              </span>
            </span>
          </button>
        </div>
      </aside>

      <!-- Open chat -->
      <section v-if="selected" class="flex min-w-0 flex-1 flex-col">
        <header class="flex shrink-0 items-center gap-3 border-b border-border/70 bg-[#f0f2f5] px-4 py-2.5 dark:bg-[#202c33]">
          <Button v-if="!isDesktop" variant="ghost" size="icon-sm" aria-label="Back to chats" @click="router.push({ name: 'messages' })"><ArrowLeft /></Button>
          <UserAvatar v-if="selected.kind === 'direct'" :user="selected.person" size="md" class="size-10" />
          <span v-else class="flex size-10 items-center justify-center rounded-full text-white" :class="selected.kind === 'team' ? 'bg-sky-500' : 'bg-violet-500'">
            <UsersRound v-if="selected.kind === 'team'" class="size-5" />
            <Building2 v-else class="size-5" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-semibold">{{ selected.title }}</span>
            <span class="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <span v-if="selected.person?.isOnline" class="size-2 rounded-full bg-[#25d366]" />
              {{ presence(selected) }}
            </span>
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button variant="ghost" size="icon-sm" aria-label="Chat options" title="Chat options"><EllipsisVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-48">
              <DropdownMenuItem variant="destructive" :disabled="thread?.isEmpty" @select="thread?.clearChat()"><Eraser /> Clear chat</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <ConversationThread ref="thread" :key="selected.id" :conversation="selected" class="min-h-0 flex-1" />
      </section>

      <section v-else-if="isDesktop" class="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <span class="flex size-20 items-center justify-center rounded-full bg-[#00a884]/10 text-[#00a884]"><MessagesSquare class="size-9" /></span>
        <p class="text-lg font-medium">Messages</p>
        <p class="max-w-sm text-sm text-muted-foreground">
          Pick a chat on the left{{ canDirect ? ', or start a new one with anyone in your organization' : '' }}. Team and department chats include everyone who belongs to them.
        </p>
      </section>
    </div>

    <Dialog v-model:open="isPickerOpen">
      <DialogContent class="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>A private conversation that only the two of you can see.</DialogDescription>
        </DialogHeader>
        <div class="relative">
          <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="peopleSearch" class="pl-9" placeholder="Search people" aria-label="Search people" autofocus />
        </div>
        <div class="max-h-80 overflow-y-auto scrollbar-thin">
          <Skeleton v-if="people === null" class="h-14 w-full" />
          <p v-else-if="!pickable.length" class="py-6 text-center text-sm text-muted-foreground">Nobody matches</p>
          <button
            v-for="person in pickable"
            :key="person.id"
            type="button"
            class="flex w-full items-center gap-3 px-2 py-2.5 text-left transition-colors hover:bg-muted/60 disabled:opacity-60"
            :disabled="isOpening !== null"
            @click="startChat(person)"
          >
            <UserAvatar :user="person" size="md" class="size-10" />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ person.name }}</span>
              <span class="block truncate text-xs text-muted-foreground">{{ person.title || person.email }}</span>
            </span>
            <span v-if="isOpening === person.id" class="text-xs text-muted-foreground">Opening…</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
