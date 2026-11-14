<script setup lang="ts">
import { Search, UserMinus, UserPlus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import PersonCard from '@/components/common/PersonCard.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { PRESENCE_LOOK } from '@/lib/presence'
import { useAuthStore } from '@/modules/auth/auth.store'
import { usePresenceStore } from '@/stores/presence.store'
import { type ChannelRoster, type ConversationSummary, channelsApi } from '../messages.api'

/** Who is in a channel. Managers of a private channel add people from the team and take them out. */
const props = defineProps<{ conversation: ConversationSummary }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const auth = useAuthStore()
const presence = usePresenceStore()
const statusOf = (userId: string) => presence.statusOf(userId)
const roster = ref<ChannelRoster | null>(null)
const search = ref('')
const chosen = ref<string[]>([])
const busy = ref<string | null>(null)
const channelId = computed(() => props.conversation.channel?.id ?? '')
const canEdit = computed(() => Boolean(roster.value?.canManage && roster.value.privacy === 'private'))

watch(
  [open, channelId],
  async ([value, id]) => {
    if (!value || !id) return
    roster.value = null
    search.value = ''
    chosen.value = []
    try {
      const loaded = await channelsApi.members(id)
      if (id === channelId.value) roster.value = loaded
    } catch (error) {
      toast.error(getErrorMessage(error))
      open.value = false
    }
  },
  { immediate: true },
)

const matches = (person: { name: string; email: string }) => {
  const term = search.value.trim().toLowerCase()
  return !term || `${person.name} ${person.email}`.toLowerCase().includes(term)
}
const members = computed(() => (roster.value?.members ?? []).filter(matches))
const candidates = computed(() => (roster.value?.candidates ?? []).filter(matches))

const toggle = (userId: string, value: boolean) => (chosen.value = value ? [...chosen.value, userId] : chosen.value.filter((id) => id !== userId))

async function add() {
  if (!chosen.value.length) return
  busy.value = 'add'
  try {
    roster.value = await channelsApi.addMembers(channelId.value, chosen.value)
    toast.success(chosen.value.length === 1 ? 'Added to the channel' : `${chosen.value.length} people added`)
    chosen.value = []
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = null
  }
}

async function remove(userId: string) {
  busy.value = userId
  try {
    roster.value = (await channelsApi.removeMember(channelId.value, userId)) ?? roster.value
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-3 sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ conversation.title }} · people</DialogTitle>
        <DialogDescription>
          {{
            roster?.privacy === 'private'
              ? canEdit
                ? 'Only these people can see this private channel. Add anyone from the team.'
                : 'Only these people can see this private channel.'
              : 'Everyone in the team is in this channel.'
          }}
        </DialogDescription>
      </DialogHeader>

      <div class="relative">
        <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="search" class="pl-9" placeholder="Search people" aria-label="Search people" />
      </div>

      <div class="max-h-[22rem] space-y-3 overflow-y-auto scrollbar-thin">
        <Skeleton v-if="roster === null" class="h-14 w-full" />
        <template v-else>
          <section>
            <p class="px-1 pb-1 text-xs font-medium text-muted-foreground">In the channel · {{ roster.members.length }}</p>
            <div v-for="person in members" :key="person.id" class="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <PersonCard :user="person" class="flex min-w-0 flex-1 items-center gap-3">
                <UserAvatar :user="person" size="md" class="size-8" presence />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ person.name }}{{ person.id === auth.user?.id ? ' (you)' : '' }}</span>
                  <span class="flex items-center gap-1 truncate text-xs" :class="statusOf(person.id) ? PRESENCE_LOOK[statusOf(person.id)!].text : 'text-muted-foreground'">
                    {{ presence.describe(person.id) || person.title || person.email }}
                  </span>
                </span>
              </PersonCard>
              <Button
                v-if="canEdit && person.id !== auth.user?.id && roster.members.length > 1"
                variant="ghost"
                size="icon-sm"
                :aria-label="`Remove ${person.name}`"
                title="Remove from the channel"
                :disabled="busy !== null"
                @click="remove(person.id)"
              >
                <UserMinus />
              </Button>
            </div>
          </section>

          <section v-if="canEdit && roster.candidates.length">
            <p class="px-1 pb-1 text-xs font-medium text-muted-foreground">Add from the team</p>
            <label v-for="person in candidates" :key="person.id" class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox :model-value="chosen.includes(person.id)" :aria-label="`Add ${person.name}`" @update:model-value="(value) => toggle(person.id, value === true)" />
              <UserAvatar :user="person" size="md" class="size-8" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ person.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ person.title || person.email }}</span>
              </span>
            </label>
          </section>
        </template>
      </div>

      <Button v-if="canEdit && roster?.candidates.length" variant="brand" :disabled="!chosen.length" :loading="busy === 'add'" @click="add">
        <UserPlus /> {{ chosen.length > 1 ? `Add ${chosen.length} people` : 'Add to the channel' }}
      </Button>
    </DialogContent>
  </Dialog>
</template>
