<script setup lang="ts">
import { Check, Package } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Version } from '@/types/models'

const props = withDefaults(
  defineProps<{
    versions: Version[]
    disabled?: boolean
    /** Hide archived versions from the picker (still show if already selected). */
    hideArchived?: boolean
    placeholder?: string
  }>(),
  { hideArchived: true, placeholder: 'Add versions' },
)
const model = defineModel<string[]>({ default: () => [] })

const isOpen = ref(false)
const search = ref('')
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

const selected = computed(() => props.versions.filter((version) => draft.value.includes(version.id)))
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return props.versions.filter((version) => {
    if (props.hideArchived && version.status === 'archived' && !draft.value.includes(version.id)) return false
    if (!q) return true
    return version.name.toLowerCase().includes(q)
  })
})

function toggle(versionId: string) {
  draft.value = draft.value.includes(versionId)
    ? draft.value.filter((id) => id !== versionId)
    : [...draft.value, versionId]
}

function statusHint(status: Version['status']) {
  if (status === 'released') return 'Released'
  if (status === 'archived') return 'Archived'
  return 'Unreleased'
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child :disabled="disabled">
      <button
        type="button"
        class="flex min-h-9 w-full flex-wrap items-center gap-1 border border-input px-2 py-1.5 text-left text-sm shadow-xs hover:bg-muted/40 disabled:opacity-50 dark:bg-input/30"
        :disabled="disabled"
      >
        <template v-if="selected.length">
          <span
            v-for="version in selected"
            :key="version.id"
            class="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium"
          >
            {{ version.name }}
          </span>
        </template>
        <span v-else class="flex items-center gap-1.5 text-muted-foreground">
          <Package class="size-3.5" /> {{ placeholder }}
        </span>
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-64 p-2">
      <input
        v-model="search"
        class="mb-2 h-8 w-full border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        placeholder="Search versions"
        aria-label="Search versions"
        @keydown.enter.prevent="filtered[0] && toggle(filtered[0].id)"
      />
      <ul class="max-h-56 overflow-y-auto" role="listbox" aria-multiselectable="true">
        <li v-for="version in filtered" :key="version.id">
          <button
            type="button"
            role="option"
            :aria-selected="draft.includes(version.id)"
            class="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent"
            @click="toggle(version.id)"
          >
            <span class="min-w-0 flex-1 text-left">
              <span class="block truncate font-medium">{{ version.name }}</span>
              <span class="text-[10px] text-muted-foreground">{{ statusHint(version.status) }}</span>
            </span>
            <Check v-if="draft.includes(version.id)" class="size-4 shrink-0 text-primary" />
          </button>
        </li>
        <li v-if="!filtered.length" class="px-2 py-3 text-center text-xs text-muted-foreground">No versions match</li>
      </ul>
    </PopoverContent>
  </Popover>
</template>
