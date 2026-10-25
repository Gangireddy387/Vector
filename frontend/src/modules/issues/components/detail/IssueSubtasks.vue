<script setup lang="ts">
import { Check, Sparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import StatusBadge from '@/components/common/StatusBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { getErrorMessage } from '@/lib/http'
import type { IssueDetail, ProjectDetail } from '@/types/models'
import { aiApi } from '../../api/ai.api'
import { issuesApi } from '../../api/issues.api'
import { useIssueActions } from '../../composables/useIssueActions'
import QuickAddInput from '../QuickAddInput.vue'

const props = withDefaults(defineProps<{ issue: IssueDetail; project: ProjectDetail; editable?: boolean }>(), { editable: true })
const emit = defineEmits<{ changed: [] }>()

const router = useRouter()
const actions = useIssueActions()
const suggestions = ref<string[]>([])
const selectedSuggestions = ref<string[]>([])
const isSuggesting = ref(false)
const isCreating = ref(false)

const doneCount = computed(() => props.issue.subtasks.filter((subtask) => subtask.status.category === 'done').length)
const progress = computed(() => (props.issue.subtasks.length ? Math.round((doneCount.value / props.issue.subtasks.length) * 100) : 0))
const canHaveSubtasks = computed(() => props.issue.type !== 'subtask')

async function toggle(subtask: IssueDetail['subtasks'][number]) {
  const isDone = subtask.status.category === 'done'
  const target = props.project.statuses.find((status) => status.category === (isDone ? 'todo' : 'done'))
  if (!target) return
  await actions.update({ id: subtask.id, key: subtask.key, projectId: props.issue.projectId }, { statusId: target.id })
  emit('changed')
}

async function suggest() {
  isSuggesting.value = true
  try {
    const result = await aiApi.breakdown(props.issue.id)
    suggestions.value = result.subtasks
    selectedSuggestions.value = [...result.subtasks]
    if (!result.subtasks.length) toast.info('No new sub-tasks to suggest')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSuggesting.value = false
  }
}

function toggleSuggestion(title: string) {
  selectedSuggestions.value = selectedSuggestions.value.includes(title)
    ? selectedSuggestions.value.filter((item) => item !== title)
    : [...selectedSuggestions.value, title]
}

async function createSuggestions() {
  isCreating.value = true
  try {
    for (const title of selectedSuggestions.value) {
      await issuesApi.create({ projectId: props.issue.projectId, parentId: props.issue.id, type: 'subtask', title, assigneeId: props.issue.assigneeId })
    }
    toast.success(`${selectedSuggestions.value.length} sub-task(s) created`)
    suggestions.value = []
    emit('changed')
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <section v-if="canHaveSubtasks" class="space-y-3">
    <div class="flex items-center justify-between gap-2">
      <h2 class="text-sm font-semibold">
        Sub-tasks
        <span v-if="issue.subtasks.length" class="font-normal text-muted-foreground">{{ doneCount }}/{{ issue.subtasks.length }}</span>
      </h2>
      <Button v-if="editable" variant="ghost" size="xs" :loading="isSuggesting" @click="suggest">
        <Sparkles class="text-primary" /> Break it down
      </Button>
    </div>
    <Progress v-if="issue.subtasks.length" :model-value="progress" class="h-1.5" indicator-class="bg-success" />

    <ul v-if="issue.subtasks.length" class="divide-y overflow-hidden border">
      <li v-for="subtask in issue.subtasks" :key="subtask.id" class="flex items-center gap-3 bg-card px-3 py-2">
        <button
          type="button"
          class="flex size-5 shrink-0 items-center justify-center border-2 transition-colors"
          :class="subtask.status.category === 'done' ? 'border-success bg-success text-white' : 'border-muted-foreground/40 hover:border-success'"
          :disabled="!editable"
          :aria-label="subtask.status.category === 'done' ? `Reopen ${subtask.key}` : `Complete ${subtask.key}`"
          @click="toggle(subtask)"
        >
          <Check v-if="subtask.status.category === 'done'" class="size-3" stroke-width="3" />
        </button>
        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left text-sm hover:underline"
          :class="subtask.status.category === 'done' && 'text-muted-foreground line-through'"
          @click="router.push({ name: 'issue', params: { issueKey: subtask.key } })"
        >
          <span class="mr-2 text-xs text-muted-foreground">{{ subtask.key }}</span>{{ subtask.title }}
        </button>
        <StatusBadge :status="subtask.status" class="hidden sm:inline-flex" />
        <UserAvatar :user="subtask.assignee" size="xs" show-tooltip />
      </li>
    </ul>

    <div v-if="suggestions.length" class="space-y-2 border border-primary/30 bg-primary/5 p-3">
      <p class="text-xs font-medium text-primary">Suggested sub-tasks — pick the ones you want</p>
      <label v-for="title in suggestions" :key="title" class="flex items-center gap-2 text-sm">
        <Checkbox :model-value="selectedSuggestions.includes(title)" @update:model-value="toggleSuggestion(title)" />
        {{ title }}
      </label>
      <div class="flex gap-2 pt-1">
        <Button size="sm" :loading="isCreating" :disabled="!selectedSuggestions.length" @click="createSuggestions">
          Create {{ selectedSuggestions.length }}
        </Button>
        <Button size="sm" variant="ghost" @click="suggestions = []">Dismiss</Button>
      </div>
    </div>

    <QuickAddInput
      v-if="editable"
      :project-id="issue.projectId"
      :defaults="{ parentId: issue.id, type: 'subtask', assigneeId: issue.assigneeId }"
      placeholder="Add a sub-task…"
      @created="emit('changed')"
    />
  </section>
</template>
