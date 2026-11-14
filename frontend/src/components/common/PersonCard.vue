<script setup lang="ts">
import { useIntervalFn, useNow } from '@vueuse/core'
import { Clock, Copy, Mail, MessageCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PRESENCE_LOOK } from '@/lib/presence'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useDirectMessage } from '@/modules/messages/useDirectMessage'
import { type UserCard, usersApi } from '@/modules/projects/projects.api'
import { usePresenceStore } from '@/stores/presence.store'
import type { UserSummary } from '@/types/models'
import PresenceBadge from './PresenceBadge.vue'
import UserAvatar from './UserAvatar.vue'

/** Cards already fetched in this session (time zones rarely change). */
const cache = new Map<string, UserCard>()

/**
 * Teams-style profile card: click someone's photo or name to see their live status, title, email and local time,
 * and start a chat with them. The trigger is the slot.
 */
const props = defineProps<{ user: UserSummary | null | undefined }>()
defineOptions({ inheritAttrs: false })

const auth = useAuthStore()
const presence = usePresenceStore()
const { canMessage, messagePerson, openingId } = useDirectMessage()
const card = ref<UserCard | null>(null)
const now = useNow({ scheduler: (callback) => useIntervalFn(callback, 30_000) })

const isMe = computed(() => props.user?.id === auth.user?.id)
const status = computed(() => (props.user ? presence.statusOf(props.user.id) : null))
const statusText = computed(() => (props.user ? presence.describe(props.user.id) : '') || (status.value ? PRESENCE_LOOK[status.value].label : ''))

/** "4:10 PM local time", and how far ahead or behind you they are. */
const localTime = computed(() => {
  const timezone = card.value?.timezone
  if (!timezone) return null
  try {
    const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(now.value)
    const offset = (zone: string) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(now.value)
      const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(parts.find((part) => part.type === 'timeZoneName')?.value ?? '')
      return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0
    }
    const mine = Intl.DateTimeFormat().resolvedOptions().timeZone
    const difference = (offset(timezone) - offset(mine)) / 60
    const relation = difference === 0 ? 'same time as you' : `${Math.abs(difference)} h ${difference > 0 ? 'ahead of' : 'behind'} you`
    return `${time} local time · ${relation}`
  } catch {
    return null
  }
})

async function onOpen(open: boolean) {
  const userId = props.user?.id
  if (!open || !userId || userId.startsWith('guest:')) return
  presence.track([userId])
  if (cache.has(userId)) return void (card.value = cache.get(userId)!)
  try {
    const loaded = await usersApi.card(userId)
    cache.set(userId, loaded)
    if (props.user?.id === userId) card.value = loaded
  } catch {
    card.value = null
  }
}

async function copyEmail() {
  if (!props.user) return
  try {
    await navigator.clipboard.writeText(props.user.email)
    toast.success('Email copied')
  } catch {
    toast.error('Could not copy the email')
  }
}
</script>

<template>
  <Popover v-if="user" @update:open="onOpen">
    <PopoverTrigger as-child>
      <button
        type="button"
        v-bind="$attrs"
        class="cursor-pointer rounded-sm text-left focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        :aria-label="`${user.name}'s profile card`"
      >
        <slot />
      </button>
    </PopoverTrigger>
    <PopoverContent side="bottom" align="start" class="w-80 overflow-hidden p-0">
      <div class="flex items-start gap-3 bg-gradient-to-br from-primary/10 to-transparent px-4 pt-4 pb-3">
        <UserAvatar :user="user" size="lg" class="size-14 text-lg" presence />
        <div class="min-w-0 flex-1 pt-0.5">
          <p class="truncate text-[15px] font-semibold">{{ user.name }}{{ isMe ? ' (you)' : '' }}</p>
          <p v-if="user.title" class="truncate text-[13px] text-muted-foreground">{{ user.title }}</p>
          <p v-if="status" class="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium" :class="PRESENCE_LOOK[status].text">
            <PresenceBadge :status="status" size="xs" /> {{ statusText }}
          </p>
        </div>
      </div>
      <div class="space-y-2 px-4 py-3 text-[13px]">
        <button type="button" class="group flex w-full items-center gap-2.5 text-left" title="Copy email" @click="copyEmail">
          <Mail class="size-4 shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate">{{ user.email }}</span>
          <Copy class="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
        </button>
        <p v-if="localTime && !isMe" class="flex items-center gap-2.5 text-muted-foreground"><Clock class="size-4 shrink-0" /> {{ localTime }}</p>
      </div>
      <div v-if="!isMe" class="flex gap-2 border-t border-border px-4 py-3">
        <Button v-if="canMessage(user.id)" variant="brand" size="sm" class="flex-1" :loading="openingId === user.id" @click="messagePerson(user.id)"><MessageCircle /> Chat</Button>
        <Button variant="outline" size="sm" class="flex-1" as-child>
          <a :href="`mailto:${user.email}`"><Mail /> Email</a>
        </Button>
      </div>
    </PopoverContent>
  </Popover>
  <span v-else v-bind="$attrs"><slot /></span>
</template>
