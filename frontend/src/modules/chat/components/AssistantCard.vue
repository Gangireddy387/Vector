<script setup lang="ts">
import { AlarmClock, ArrowRight, CircleAlert, Link2, NotebookPen, Send } from 'lucide-vue-next'
import { reactive, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import RichText from '@/components/common/RichText.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { describeDue, formatDate } from '@/lib/format'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useOpenIssue } from '@/modules/issues/composables/useOpenIssue'
import { standupApi } from '@/modules/standup/standup.api'
import type { AssistantCommand, AssistantMeta, StandupDraftSections } from '../chat.api'

const props = defineProps<{ meta: AssistantMeta; projectId: string; issueKeys: string[] }>()
const emit = defineEmits<{ useCommand: [command: AssistantCommand]; draftPosted: [] }>()

const auth = useAuthStore()
const openIssue = useOpenIssue()
const isSaving = ref(false)
const saved = ref(false)

const draftForm = reactive<StandupDraftSections>({
  yesterday: '',
  today: '',
  blockers: '',
})

watch(
  () => (props.meta.type === 'standup_draft' ? props.meta.draft : null),
  (draft) => {
    if (!draft) return
    draftForm.yesterday = draft.yesterday ?? ''
    draftForm.today = draft.today ?? ''
    draftForm.blockers = draft.blockers ?? ''
  },
  { immediate: true, deep: true },
)

async function saveDraft() {
  if (props.meta.type !== 'standup_draft') return
  isSaving.value = true
  try {
    await standupApi.save(props.projectId, {
      date: props.meta.date,
      yesterday: draftForm.yesterday.trim(),
      today: draftForm.today.trim(),
      blockers: draftForm.blockers.trim(),
    })
    saved.value = true
    emit('draftPosted')
    toast.success('Posted to the team', {
      description: `Your standup for ${formatDate(props.meta.date, 'EEE, d MMM')} is saved. The review draft is removed; the team sees your post in Work chat.`,
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <!-- Standup draft: review → edit → post (private until Save) -->
  <div v-if="meta.type === 'standup_draft'" class="space-y-3 border border-amber-500/30 bg-amber-500/5 p-3 dark:bg-amber-500/10">
    <p class="text-xs font-medium text-amber-800 dark:text-amber-300">
      Review your draft. Edit anything below, then post — the team only sees it after you send.
    </p>
    <div v-for="section in (['yesterday', 'today', 'blockers'] as const)" :key="section" class="space-y-1">
      <p class="text-xs font-medium" :class="section === 'blockers' ? 'text-destructive' : 'text-muted-foreground'">
        {{ section === 'yesterday' ? 'Since last standup' : section === 'today' ? 'Today' : 'Blockers (optional)' }}
      </p>
      <template v-if="meta.forUserId === auth.user?.id && !saved">
        <Textarea
          v-model="draftForm[section]"
          :rows="section === 'blockers' ? 2 : 3"
          class="min-h-0 resize-y text-sm"
          :placeholder="section === 'blockers' ? 'Nothing blocking you? Leave blank.' : 'Add or edit bullets…'"
          :aria-label="section === 'yesterday' ? 'Since last standup' : section === 'today' ? 'Today' : 'Blockers'"
        />
      </template>
      <RichText v-else-if="draftForm[section]" :source="draftForm[section]" :issue-keys="issueKeys" compact />
      <p v-else-if="saved && section === 'blockers'" class="text-xs text-muted-foreground">No blockers</p>
    </div>
    <div v-if="meta.forUserId === auth.user?.id" class="flex flex-wrap items-center gap-2 border-t border-amber-500/20 pt-3">
      <Button size="sm" :loading="isSaving" :disabled="saved" @click="saveDraft">
        <Send v-if="!saved" />
        <NotebookPen v-else />
        {{ saved ? 'Posted to the team' : 'Post standup to the team' }}
      </Button>
      <Button v-if="!saved" size="sm" variant="ghost" as-child>
        <RouterLink :to="{ name: 'project-standup', params: { projectId }, query: { date: meta.date } }">
          Open full editor <ArrowRight />
        </RouterLink>
      </Button>
    </div>
  </div>

  <!-- Task status / task lists -->
  <ul v-else-if="(meta.type === 'issue_status' || meta.type === 'issue_list' || meta.type === 'answer') && meta.issues.length" class="divide-y border bg-card">
    <li v-for="issue in meta.issues" :key="issue.id">
      <button type="button" class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent/50" @click="openIssue(issue)">
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
      </button>
    </li>
    <li v-if="meta.type === 'issue_list' && meta.total > meta.issues.length" class="px-3 py-2 text-xs text-muted-foreground">
      and {{ meta.total - meta.issues.length }} more
    </li>
  </ul>

  <!-- Blockers -->
  <div v-else-if="meta.type === 'blockers' && (meta.reported.length || meta.blocked.length || meta.overdue.length)" class="space-y-3 border bg-card p-3 text-sm">
    <div v-if="meta.reported.length">
      <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive"><CircleAlert class="size-3.5" /> Reported in standup</p>
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
      <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Link2 class="size-3.5" /> Waiting on other tasks</p>
      <ul class="space-y-1">
        <li v-for="row in meta.blocked" :key="`${row.blocked.key}-${row.by.key}`" class="text-xs">
          <button type="button" class="font-mono font-semibold text-primary hover:underline" @click="openIssue(row.blocked)">{{ row.blocked.key }}</button>
          is waiting on
          <button type="button" class="font-mono font-semibold text-primary hover:underline" @click="openIssue(row.by)">{{ row.by.key }}</button>
          <span class="text-muted-foreground"> {{ row.by.title }}</span>
        </li>
      </ul>
    </div>
    <div v-if="meta.overdue.length">
      <p class="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><AlarmClock class="size-3.5" /> Overdue</p>
      <ul class="space-y-1">
        <li v-for="issue in meta.overdue" :key="issue.id" class="flex items-center gap-2 text-xs">
          <button type="button" class="font-mono font-semibold text-primary hover:underline" @click="openIssue(issue)">{{ issue.key }}</button>
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
