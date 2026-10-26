<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { parseQuickAdd } from '@/lib/quick-add-parser'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import type { IssueDetail } from '@/types/models'
import { type CreateIssueInput, issuesApi } from '../api/issues.api'
import QuickAddSyntaxHelp from './QuickAddSyntaxHelp.vue'
import QuickAddTokens from './QuickAddTokens.vue'

const props = withDefaults(
  defineProps<{
    projectId: string
    defaults?: Partial<CreateIssueInput>
    placeholder?: string
    autofocus?: boolean
    class?: string
  }>(),
  { placeholder: 'Add a task… try “Fix login @me #backend !high ^fri”', autofocus: false },
)
const emit = defineEmits<{ created: [issue: IssueDetail] }>()

const auth = useAuthStore()
const projects = useProjectsStore()
const ui = useUiStore()
const router = useRouter()

const text = ref('')
const isSaving = ref(false)
const project = computed(() => projects.details[props.projectId])

watch(() => props.projectId, (id) => id && projects.fetchProject(id), { immediate: true })

const parsed = computed(() =>
  parseQuickAdd(text.value, {
    members: project.value?.members ?? [],
    labels: project.value?.labels ?? [],
    currentUserId: auth.user?.id,
  }),
)

async function submit() {
  const result = parsed.value
  if (!result.title || isSaving.value) return
  isSaving.value = true
  try {
    const payload: CreateIssueInput = { ...props.defaults, projectId: props.projectId, title: result.title }
    if (result.assigneeId !== undefined) payload.assigneeId = result.assigneeId
    if (result.labelIds.length) payload.labelIds = result.labelIds
    if (result.priority) payload.priority = result.priority
    if (result.dueDate) payload.dueDate = result.dueDate
    if (result.storyPoints !== undefined) payload.storyPoints = result.storyPoints
    if (result.type) payload.type = result.type

    const issue = await issuesApi.create(payload)
    text.value = ''
    ui.notifyIssuesChanged()
    emit('created', issue)
    toast.success(`${issue.key} created`, {
      description: issue.title,
      action: { label: 'Open', onClick: () => router.push({ name: 'issue', params: { issueKey: issue.key } }) },
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <div :class="cn('space-y-1.5', props.class)">
    <div class="flex items-center gap-2 border border-dashed bg-background px-2.5 focus-within:border-solid focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
      <Plus class="size-4 shrink-0 text-muted-foreground" />
      <input
        v-model="text"
        class="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        :placeholder="placeholder"
        :autofocus="autofocus"
        :disabled="isSaving"
        aria-label="Quick add task"
        enterkeyhint="done"
        @keydown.enter.prevent="submit"
        @keydown.esc="text = ''"
      />
      <QuickAddSyntaxHelp />
    </div>
    <QuickAddTokens :tokens="parsed.tokens" class="px-1" />
  </div>
</template>
