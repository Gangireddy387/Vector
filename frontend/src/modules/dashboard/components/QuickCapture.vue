<script setup lang="ts">
import { useStorage } from '@vueuse/core'
import { computed, watch } from 'vue'
import { SelectField, type SelectFieldOption } from '@/components/forms'
import { useAuthStore } from '@/modules/auth/auth.store'
import QuickAddInput from '@/modules/issues/components/QuickAddInput.vue'
import { useProjectsStore } from '@/modules/projects/projects.store'

withDefaults(defineProps<{ stacked?: boolean }>(), { stacked: false })

const projects = useProjectsStore()
const auth = useAuthStore()
const projectId = useStorage<string | null>('vector.lastProjectId', null)

const writableProjects = computed(() => projects.activeProjects.filter((project) => project.myRole !== 'viewer'))
const selected = computed(() => writableProjects.value.find((project) => project.id === projectId.value))
const projectOptions = computed<SelectFieldOption[]>(() =>
  writableProjects.value.map((project) => ({ value: project.id, label: project.name, description: project.key, color: project.color })),
)

watch(
  writableProjects,
  (list) => {
    if (!list.some((project) => project.id === projectId.value)) projectId.value = list[0]?.id ?? null
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="selected" class="flex gap-2" :class="stacked ? 'flex-col' : 'items-start'">
    <SelectField
      :model-value="projectId"
      :options="projectOptions"
      :class="stacked ? 'w-full' : 'w-52 shrink-0'"
      aria-label="Project for new task"
      @update:model-value="(value) => value && (projectId = value)"
    />
    <QuickAddInput
      :project-id="selected.id"
      :defaults="{ assigneeId: auth.user?.id }"
      placeholder="Capture a task… “Send report @me ^fri !high”"
      class="min-w-0 flex-1"
    />
  </div>
</template>
