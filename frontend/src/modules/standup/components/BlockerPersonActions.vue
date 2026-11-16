<script setup lang="ts">
import { ListTodo, MessageCircle } from 'lucide-vue-next'
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import MeetButton from '@/modules/meetings/components/MeetButton.vue'
import { useDirectMessage } from '@/modules/messages/useDirectMessage'
import { useUiStore } from '@/stores/ui.store'
import type { UserSummary } from '@/types/models'

/**
 * Manager actions on a standup blocker: assign a task, DM the person, or start a quick meet.
 */
const props = defineProps<{
  user: UserSummary
  projectId: string
  blockerText: string
  compact?: boolean
}>()

const ui = useUiStore()
const { canMessage, messagePerson, openingId } = useDirectMessage()

const title = computed(() => {
  const snippet = props.blockerText.replace(/\s+/g, ' ').trim().slice(0, 80)
  return snippet ? `Unblock: ${snippet}` : `Unblock ${props.user.name.split(' ')[0]}`
})

const meetPreset = computed(() => ({
  title: `Unblock ${props.user.name.split(' ')[0]}`,
  people: [props.user],
  context: { type: 'project' as const, id: props.projectId },
}))

function assignTask() {
  ui.openCreateIssue({
    projectId: props.projectId,
    assigneeId: props.user.id,
    title: title.value,
    description: `From standup blocker:\n\n${props.blockerText.trim()}`,
  })
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-1.5" @click.stop>
    <Button size="sm" variant="outline" class="max-sm:flex-1" @click="assignTask">
      <ListTodo /> Assign task
    </Button>
    <Button
      v-if="canMessage(user.id)"
      size="sm"
      variant="outline"
      class="max-sm:flex-1"
      :loading="openingId === user.id"
      @click="messagePerson(user.id)"
    >
      <MessageCircle /> Message
    </Button>
    <MeetButton :preset="meetPreset" :compact="compact" size="sm" />
  </div>
</template>
