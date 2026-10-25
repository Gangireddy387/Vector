<script setup lang="ts">
import { Bot, ClipboardList, MessagesSquare } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, timeAgo } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { chatApi, type Followup } from '@/modules/chat/chat.api'

/** The task's follow-up record: every chat message and standup update that mentioned it. */
const props = defineProps<{ issueId: string; issueKey: string; projectId: string; refreshKey?: number }>()

const followups = ref<Followup[] | null>(null)
const errorMessage = ref('')

watch(
  () => [props.issueId, props.refreshKey],
  async () => {
    errorMessage.value = ''
    try {
      followups.value = await chatApi.followups(props.issueId)
    } catch (error) {
      errorMessage.value = getErrorMessage(error)
    }
  },
  { immediate: true },
)

const SECTION_LABELS = { yesterday: 'Done', today: 'Planned', blockers: 'Blocked' } as const
</script>

<template>
  <div class="space-y-3">
    <p v-if="errorMessage" class="bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{{ errorMessage }}</p>
    <div v-else-if="!followups" class="space-y-3">
      <Skeleton v-for="index in 3" :key="index" class="h-16 w-full" />
    </div>

    <EmptyState
      v-else-if="!followups.length"
      :icon="MessagesSquare"
      title="No follow-ups yet"
      :description="`Mention ${issueKey} in the team chat or in a standup update and it is recorded here, so the whole story of this task stays in one place.`"
      class="border border-dashed py-8"
    >
      <Button variant="outline" size="sm" as-child>
        <RouterLink :to="{ name: 'project-chat', params: { projectId } }"><MessagesSquare /> Open team chat</RouterLink>
      </Button>
    </EmptyState>

    <ol v-else class="relative space-y-3 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
      <li v-for="item in followups" :key="`${item.type}-${item.id}`" class="relative flex gap-3">
        <span
          v-if="item.type === 'chat' && item.kind === 'bot'"
          class="relative z-10 flex size-8 shrink-0 items-center justify-center bg-brand text-white"
        >
          <Bot class="size-4" />
        </span>
        <UserAvatar v-else :user="item.author" size="md" class="relative z-10 ring-4 ring-background" />

        <div class="min-w-0 flex-1 border bg-card px-3 py-2.5">
          <p class="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
            <span class="font-semibold">{{ item.type === 'chat' && item.kind === 'bot' ? 'Vector Assistant' : item.author?.name ?? 'Former member' }}</span>
            <template v-if="item.type === 'chat'">
              <span class="inline-flex items-center gap-1 text-muted-foreground"><MessagesSquare class="size-3" /> in team chat</span>
              <span class="text-muted-foreground" :title="formatDate(item.at, 'd MMM yyyy, HH:mm')">· {{ timeAgo(item.at) }}</span>
              <RouterLink
                :to="{ name: 'project-chat', params: { projectId: item.projectId }, query: { message: item.id } }"
                class="ml-auto text-primary hover:underline"
              >
                View in chat
              </RouterLink>
            </template>
            <template v-else>
              <span class="inline-flex items-center gap-1 text-muted-foreground"><ClipboardList class="size-3" /> standup · {{ formatDate(item.date, 'EEE, d MMM yyyy') }}</span>
              <RouterLink
                :to="{ name: 'project-standup', params: { projectId: item.projectId }, query: { date: item.date } }"
                class="ml-auto text-primary hover:underline"
              >
                Open standup
              </RouterLink>
            </template>
          </p>

          <RichText v-if="item.type === 'chat'" :source="item.body" :issue-keys="[issueKey]" compact />
          <dl v-else class="space-y-1 text-sm">
            <template v-for="(lines, section) in item.sections" :key="section">
              <div v-if="lines.length" class="flex gap-2">
                <dt class="w-16 shrink-0 text-xs font-semibold leading-5" :class="section === 'blockers' ? 'text-destructive' : 'text-muted-foreground'">
                  {{ SECTION_LABELS[section] }}
                </dt>
                <dd class="min-w-0 flex-1 space-y-0.5">
                  <RichText v-for="(line, index) in lines" :key="index" :source="line" :issue-keys="[issueKey]" compact />
                </dd>
              </div>
            </template>
          </dl>
        </div>
      </li>
    </ol>
  </div>
</template>
