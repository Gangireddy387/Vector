<script setup lang="ts">
import { AlarmClock, ArrowRight, CircleAlert, Link2, NotebookPen } from 'lucide-vue-next'
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { describeDue, formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { standupApi } from '@/modules/standup/standup.api'
import type { AssistantCommand, AssistantMeta } from '../chat.api'

const props = defineProps<{ meta: AssistantMeta; projectId: string; issueKeys: string[] }>()
const emit = defineEmits<{ useCommand: [command: AssistantCommand] }>()

const auth = useAuthStore()
const isSaving = ref(false)
const saved = ref(false)

async function saveDraft() {
  if (props.meta.type !== 'standup_draft') return
  isSaving.value = true
  try {
    await standupApi.save(props.projectId, { date: props.meta.date, ...props.meta.draft })
    saved.value = true
    toast.success('Saved to the standup', { description: `Your update for ${formatDate(props.meta.date, 'EEE, d MMM')} is recorded.` })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <!-- Standup draft -->
  <div v-if="meta.type === 'standup_draft'" class="space-y-3 border bg-card p-3">
    <div v-for="section in (['yesterday', 'today', 'blockers'] as const)" :key="section">
      <template v-if="meta.draft[section]">
        <p class="mb-1 text-[11px] font-semibold tracking-wide uppercase" :class="section === 'blockers' ? 'text-destructive' : 'text-muted-foreground'">
          {{ section === 'yesterday' ? 'Since last standup' : section === 'today' ? 'Today' : 'Blockers' }}
        </p>
        <RichText :source="meta.draft[section]" :issue-keys="issueKeys" compact />
      </template>
    </div>
    <div v-if="meta.forUserId === auth.user?.id" class="flex flex-wrap items-center gap-2 border-t pt-3">
      <Button size="sm" :loading="isSaving" :disabled="saved" @click="saveDraft"><NotebookPen /> {{ saved ? 'Saved' : 'Save as my standup' }}</Button>
      <Button size="sm" variant="ghost" as-child>
        <RouterLink :to="{ name: 'project-standup', params: { projectId }, query: { date: meta.date } }">Edit on the standup page <ArrowRight /></RouterLink>
      </Button>
    </div>
  </div>

  <!-- Task status / task lists -->
  <ul v-else-if="(meta.type === 'issue_status' || meta.type === 'issue_list' || meta.type === 'answer') && meta.issues.length" class="divide-y border bg-card">
    <li v-for="issue in meta.issues" :key="issue.id">
      <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent/50">
        <IssueTypeIcon :type="issue.type" />
        <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ issue.key }}</span>
        <span class="min-w-0 flex-1 truncate">{{ issue.title }}</span>
        <span
          v-if="issue.dueDate && issue.status?.category !== 'done'"
          class="hidden shrink-0 text-xs sm:inline"
          :class="describeDue(issue.dueDate).includes('overdue') ? 'font-medium text-destructive' : 'text-muted-foreground'"
        >
          {{ describeDue(issue.dueDate) }}
        </span>
        <span v-if="issue.status" class="inline-flex shrink-0 items-center gap-1.5 border px-1.5 py-px text-[11px] font-medium">
          <span class="size-1.5 rounded-full" :style="{ backgroundColor: issue.status.color }" /> {{ issue.status.name }}
        </span>
        <UserAvatar :user="issue.assignee" size="xs" show-tooltip />
      </RouterLink>
    </li>
    <li v-if="meta.type === 'issue_list' && meta.total > meta.issues.length" class="px-3 py-2 text-xs text-muted-foreground">
      and {{ meta.total - meta.issues.length }} more
    </li>
  </ul>

  <!-- Blockers -->
  <div v-else-if="meta.type === 'blockers' && (meta.reported.length || meta.blocked.length || meta.overdue.length)" class="space-y-3 border bg-card p-3 text-sm">
    <div v-if="meta.reported.length">
      <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-destructive uppercase"><CircleAlert class="size-3.5" /> Reported in standup</p>
      <ul class="space-y-2">
        <li v-for="row in meta.reported" :key="row.user.id" class="flex gap-2">
          <UserAvatar :user="row.user" size="xs" class="mt-0.5" />
          <div class="min-w-0">
            <p class="text-xs font-medium">{{ row.user.name }}</p>
            <RichText :source="row.text" :issue-keys="issueKeys" compact />
          </div>
        </li>
      </ul>
    </div>
    <div v-if="meta.blocked.length">
      <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"><Link2 class="size-3.5" /> Waiting on other tasks</p>
      <ul class="space-y-1">
        <li v-for="row in meta.blocked" :key="`${row.blocked.key}-${row.by.key}`" class="text-xs">
          <RouterLink :to="{ name: 'issue', params: { issueKey: row.blocked.key } }" class="font-mono font-semibold text-primary hover:underline">{{ row.blocked.key }}</RouterLink>
          is waiting on
          <RouterLink :to="{ name: 'issue', params: { issueKey: row.by.key } }" class="font-mono font-semibold text-primary hover:underline">{{ row.by.key }}</RouterLink>
          <span class="text-muted-foreground"> {{ row.by.title }}</span>
        </li>
      </ul>
    </div>
    <div v-if="meta.overdue.length">
      <p class="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"><AlarmClock class="size-3.5" /> Overdue</p>
      <ul class="space-y-1">
        <li v-for="issue in meta.overdue" :key="issue.id" class="flex items-center gap-2 text-xs">
          <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="font-mono font-semibold text-primary hover:underline">{{ issue.key }}</RouterLink>
          <span class="truncate">{{ issue.title }}</span>
          <span class="ml-auto shrink-0 font-medium text-destructive">{{ describeDue(issue.dueDate) }}</span>
          <UserAvatar :user="issue.assignee" size="xs" show-tooltip />
        </li>
      </ul>
    </div>
  </div>

  <!-- Team standup summary -->
  <div v-else-if="meta.type === 'standup_summary'" class="space-y-3 border bg-card p-3 text-sm">
    <div class="flex items-center gap-3">
      <span class="h-2 flex-1 bg-muted"><span class="block h-full bg-success" :style="{ width: `${meta.expected ? (meta.posted / meta.expected) * 100 : 0}%` }" /></span>
      <span class="text-xs font-semibold tabular-nums">{{ meta.posted }}/{{ meta.expected }} posted</span>
    </div>
    <ul v-if="meta.updates.length" class="space-y-2">
      <li v-for="row in meta.updates" :key="row.user.id" class="flex gap-2">
        <UserAvatar :user="row.user" size="xs" class="mt-0.5" />
        <div class="min-w-0 flex-1">
          <p class="text-xs font-medium">{{ row.user.name }}</p>
          <RichText v-if="row.today" :source="row.today" :issue-keys="issueKeys" compact class="text-muted-foreground" />
          <p v-if="row.blockers" class="mt-1 text-xs font-medium text-destructive">Blocked: {{ row.blockers.replace(/^\s*[-*]\s*/gm, '').split('\n').join('; ') }}</p>
        </div>
      </li>
    </ul>
    <Button size="sm" variant="outline" as-child>
      <RouterLink :to="{ name: 'project-standup', params: { projectId }, query: { date: meta.date } }">Open the standup <ArrowRight /></RouterLink>
    </Button>
  </div>

  <!-- Help -->
  <ul v-else-if="meta.type === 'help'" class="grid gap-1.5 sm:grid-cols-2">
    <li v-for="command in meta.commands" :key="command.name">
      <button
        type="button"
        class="flex w-full flex-col items-start border bg-card px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
        @click="emit('useCommand', command)"
      >
        <span class="font-mono text-xs font-semibold text-primary">{{ command.usage }}</span>
        <span class="text-xs text-muted-foreground">{{ command.description }}</span>
      </button>
    </li>
  </ul>
</template>
