<script setup lang="ts">
import { Bookmark, Pencil, Star, Trash2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import type { SavedFilter, SavedFilterSurface } from '@/types/models'
import { savedFiltersApi } from '../api/saved-filters.api'
import { criteriaEqual, sanitizeCriteria, summarizeCriteria, type SavedCriteria } from '../lib/saved-filter-criteria'

type CriteriaMap = Record<string, string | undefined>

const props = withDefaults(
  defineProps<{
    projectId?: string
    criteria: CriteriaMap
    surface?: SavedFilterSurface
    /** Compact trigger for the mobile filter sheet. */
    stacked?: boolean
    sanitize?: (criteria: CriteriaMap | SavedCriteria) => Record<string, string>
    summarize?: (criteria: SavedCriteria) => string[]
    equal?: (a: SavedCriteria, b: SavedCriteria) => boolean
    saveLabel?: string
    emptyLabel?: string
  }>(),
  {
    surface: 'issues',
    stacked: false,
    saveLabel: 'Save current filters…',
    emptyLabel: 'No saved views yet',
  },
)
const emit = defineEmits<{ apply: [criteria: Record<string, string>]; loaded: [filters: SavedFilter[]] }>()

const confirm = useConfirm()
const filters = ref<SavedFilter[]>([])
const isSaveOpen = ref(false)
const isRenameOpen = ref(false)
const name = ref('')
const makeDefault = ref(false)
const renaming = ref<SavedFilter | null>(null)

const sanitize = (value: CriteriaMap | SavedCriteria) => (props.sanitize ?? sanitizeCriteria)(value)
const summarize = (value: SavedCriteria) => (props.summarize ?? summarizeCriteria)(value)
const equal = (a: SavedCriteria, b: SavedCriteria) => (props.equal ?? criteriaEqual)(a, b)

const activeId = computed(() => {
  const current = sanitize(props.criteria)
  return filters.value.find((filter) => equal(filter.criteria, current))?.id
})

const canSave = computed(() => Object.keys(sanitize(props.criteria)).length > 0)

const load = async () => {
  filters.value = await savedFiltersApi.list(props.projectId, props.surface)
  emit('loaded', filters.value)
}

onMounted(load)
watch(() => [props.projectId, props.surface] as const, load)

async function save() {
  if (!name.value.trim() || !canSave.value) return
  try {
    await savedFiltersApi.create({
      name: name.value.trim(),
      projectId: props.projectId ?? null,
      surface: props.surface,
      criteria: sanitize(props.criteria),
      isDefault: makeDefault.value,
    })
    toast.success('View saved')
    isSaveOpen.value = false
    name.value = ''
    makeDefault.value = false
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function openSave() {
  name.value = ''
  makeDefault.value = false
  isSaveOpen.value = true
}

function openRename(filter: SavedFilter) {
  renaming.value = filter
  name.value = filter.name
  isRenameOpen.value = true
}

async function rename() {
  if (!renaming.value || !name.value.trim()) return
  try {
    await savedFiltersApi.update(renaming.value.id, { name: name.value.trim() })
    toast.success('View renamed')
    isRenameOpen.value = false
    renaming.value = null
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function toggleDefault(filter: SavedFilter) {
  try {
    await savedFiltersApi.update(filter.id, { isDefault: !filter.isDefault })
    toast.success(filter.isDefault ? 'Default cleared' : 'Set as default view')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(filter: SavedFilter) {
  if (!(await confirm({ title: `Delete “${filter.name}”?`, confirmLabel: 'Delete', destructive: true }))) return
  try {
    await savedFiltersApi.remove(filter.id)
    toast.success('View deleted')
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

function apply(filter: SavedFilter) {
  emit('apply', sanitize(filter.criteria))
}

defineExpose({ load, filters })
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button :variant="stacked ? 'outline' : 'outline'" :size="stacked ? 'default' : 'sm'" :class="stacked && 'w-full justify-start'">
        <Bookmark />
        Views
        <span v-if="filters.length" class="text-muted-foreground">({{ filters.length }})</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-72">
      <DropdownMenuLabel>Saved views</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="filter in filters"
        :key="filter.id"
        class="group items-start gap-2 py-2"
        :class="filter.id === activeId && 'bg-accent/70'"
        @select="apply(filter)"
      >
        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <Star v-if="filter.isDefault" class="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Default view" />
            <span class="truncate font-medium">{{ filter.name }}</span>
          </span>
          <span v-if="summarize(filter.criteria).length" class="mt-0.5 block truncate text-[11px] text-muted-foreground">
            {{ summarize(filter.criteria).join(' · ') }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button type="button" class="rounded p-1 hover:bg-muted" :aria-label="filter.isDefault ? 'Clear default' : 'Set as default'" @click.stop="toggleDefault(filter)">
            <Star class="size-3.5" :class="filter.isDefault && 'fill-amber-400 text-amber-500'" />
          </button>
          <button type="button" class="rounded p-1 hover:bg-muted" :aria-label="`Rename ${filter.name}`" @click.stop="openRename(filter)">
            <Pencil class="size-3.5" />
          </button>
          <button type="button" class="rounded p-1 hover:bg-muted" :aria-label="`Delete ${filter.name}`" @click.stop="remove(filter)">
            <Trash2 class="size-3.5" />
          </button>
        </span>
      </DropdownMenuItem>
      <p v-if="!filters.length" class="px-2 py-1.5 text-xs text-muted-foreground">{{ emptyLabel }}</p>
      <DropdownMenuSeparator />
      <DropdownMenuItem :disabled="!canSave" @select="openSave">{{ saveLabel }}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Dialog v-model:open="isSaveOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <Input v-model="name" :placeholder="surface === 'board' ? 'e.g. My bugs by assignee' : 'e.g. My open bugs'" autofocus aria-label="View name" />
        <p v-if="summarize(criteria).length" class="text-xs text-muted-foreground">
          {{ summarize(criteria).join(' · ') }}
        </p>
        <label class="flex items-center gap-2 text-sm">
          <Checkbox :model-value="makeDefault" @update:model-value="(value) => (makeDefault = value === true)" />
          Open this view by default
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" @click="isSaveOpen = false">Cancel</Button>
          <Button type="submit" :disabled="!name.trim() || !canSave">Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="isRenameOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader><DialogTitle>Rename view</DialogTitle></DialogHeader>
      <form class="space-y-4" @submit.prevent="rename">
        <Input v-model="name" placeholder="View name" autofocus aria-label="View name" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="isRenameOpen = false">Cancel</Button>
          <Button type="submit" :disabled="!name.trim()">Rename</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
