<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { issuesApi } from '../../api/issues.api'

const EPIC_LIMIT = 200

const props = withDefaults(
  defineProps<{
    projectId: string
    noneLabel?: string
    size?: 'sm' | 'default'
    disabled?: boolean
    id?: string
    ariaLabel?: string
  }>(),
  { noneLabel: 'No epic', size: 'default', ariaLabel: 'Epic' },
)
const model = defineModel<string | null>({ default: null })

const epics = ref<Array<{ id: string; key: string; title: string }>>([])
const totalEpics = ref(0)
const isLoading = ref(false)

const truncated = computed(() => totalEpics.value > epics.value.length)

async function load() {
  if (!props.projectId) {
    epics.value = []
    totalEpics.value = 0
    return
  }
  isLoading.value = true
  try {
    const result = await issuesApi.list({ projectId: props.projectId, type: 'epic', sort: 'key', order: 'asc', limit: EPIC_LIMIT })
    epics.value = result.issues.map((issue) => ({ id: issue.id, key: issue.key, title: issue.title }))
    totalEpics.value = result.total
  } catch {
    epics.value = []
    totalEpics.value = 0
  } finally {
    isLoading.value = false
  }
}

watch(() => props.projectId, load, { immediate: true })

const options = computed<SelectFieldOption[]>(() => [
  { value: null, label: props.noneLabel },
  ...epics.value.map((epic) => ({
    value: epic.id,
    label: epic.title,
    description: epic.key,
  })),
])
</script>

<template>
  <div class="space-y-1.5">
    <SelectField
      :id="id"
      v-model="model"
      :options="options"
      :placeholder="isLoading ? 'Loading epics…' : noneLabel"
      :size="size"
      :disabled="disabled || isLoading"
      :aria-label="ariaLabel"
      search-placeholder="Search epics"
      :searchable="epics.length > 5"
    />
    <p v-if="truncated" class="text-[11px] text-muted-foreground" role="status">
      Showing the first {{ EPIC_LIMIT }} of {{ totalEpics }} epics. Rename or archive older epics if you need one that is missing.
    </p>
  </div>
</template>
