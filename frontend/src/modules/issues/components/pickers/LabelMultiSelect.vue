<script setup lang="ts">
import { Check, Plus, Tag } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import LabelChip from '@/components/common/LabelChip.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COLOR_SWATCHES } from '@/constants/issue'
import { getErrorMessage } from '@/lib/http'
import { projectsApi } from '@/modules/projects/projects.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import type { Label } from '@/types/models'

const props = withDefaults(defineProps<{ labels: Label[]; projectId?: string; disabled?: boolean; allowCreate?: boolean }>(), {
  allowCreate: true,
})
const model = defineModel<string[]>({ default: () => [] })

const projects = useProjectsStore()
const isOpen = ref(false)
const search = ref('')
const isCreating = ref(false)

/** Picks are collected while the list is open and committed once on close, so quick multi-select never races a save. */
const draft = ref<string[]>([...model.value])
watch(model, (value) => {
  if (!isOpen.value) draft.value = [...value]
})
watch(isOpen, (open) => {
  if (open) {
    draft.value = [...model.value]
    return
  }
  search.value = ''
  const changed = draft.value.length !== model.value.length || draft.value.some((id) => !model.value.includes(id))
  if (changed) model.value = [...draft.value]
})

const selectedLabels = computed(() => props.labels.filter((label) => draft.value.includes(label.id)))
const filtered = computed(() => props.labels.filter((label) => label.name.includes(search.value.trim().toLowerCase())))
const canCreate = computed(
  () => props.allowCreate && props.projectId && search.value.trim() && !props.labels.some((label) => label.name === search.value.trim().toLowerCase()),
)

function toggle(labelId: string) {
  draft.value = draft.value.includes(labelId) ? draft.value.filter((id) => id !== labelId) : [...draft.value, labelId]
}

async function createLabel() {
  if (!props.projectId) return
  isCreating.value = true
  try {
    const color = COLOR_SWATCHES[props.labels.length % COLOR_SWATCHES.length]!
    const label = await projectsApi.createLabel(props.projectId, { name: search.value.trim().toLowerCase(), color })
    await projects.fetchProject(props.projectId, true)
    draft.value = [...draft.value, label.id]
    search.value = ''
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child :disabled="disabled">
      <button
        type="button"
        class="flex min-h-9 w-full flex-wrap items-center gap-1 border border-input px-2 py-1.5 text-left text-sm shadow-xs hover:bg-muted/40 disabled:opacity-50 dark:bg-input/30"
        :disabled="disabled"
        aria-label="Labels"
      >
        <template v-if="selectedLabels.length">
          <LabelChip v-for="label in selectedLabels" :key="label.id" :label="label" />
        </template>
        <span v-else class="flex items-center gap-1.5 text-muted-foreground"><Tag class="size-3.5" /> Add labels</span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-64 p-2">
      <input
        v-model="search"
        class="mb-2 h-8 w-full border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        placeholder="Search or create label"
        aria-label="Search labels"
        @keydown.enter.prevent="canCreate ? createLabel() : filtered[0] && toggle(filtered[0].id)"
      />
      <ul class="max-h-56 overflow-y-auto" role="listbox" aria-multiselectable="true">
        <li v-for="label in filtered" :key="label.id">
          <button
            type="button"
            role="option"
            :aria-selected="draft.includes(label.id)"
            class="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
            @click="toggle(label.id)"
          >
            <span class="size-2.5 rounded-full" :style="{ backgroundColor: label.color }" />
            <span class="flex-1 text-left">{{ label.name }}</span>
            <Check v-if="draft.includes(label.id)" class="size-4 text-primary" />
          </button>
        </li>
      </ul>
      <Button v-if="canCreate" variant="ghost" size="sm" class="mt-1 w-full justify-start" :loading="isCreating" @click="createLabel">
        <Plus /> Create “{{ search.trim().toLowerCase() }}”
      </Button>
      <p v-if="!filtered.length && !canCreate" class="px-2 py-3 text-center text-xs text-muted-foreground">No labels</p>
      <div class="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
        <span>{{ draft.length }} selected</span>
        <Button size="xs" @click="isOpen = false">Done</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
