<script setup lang="ts">
import { Bookmark, Trash2 } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
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
import { getErrorMessage } from '@/lib/http'
import type { SavedFilter } from '@/types/models'
import { savedFiltersApi } from '../api/saved-filters.api'

const props = defineProps<{ projectId?: string; criteria: Record<string, string | undefined> }>()
const emit = defineEmits<{ apply: [criteria: Record<string, string>] }>()

const filters = ref<SavedFilter[]>([])
const isSaveOpen = ref(false)
const name = ref('')

const load = async () => (filters.value = await savedFiltersApi.list(props.projectId))
onMounted(load)

async function save() {
  if (!name.value.trim()) return
  try {
    const criteria = Object.fromEntries(Object.entries(props.criteria).filter(([, value]) => value)) as Record<string, string>
    await savedFiltersApi.create({ name: name.value.trim(), projectId: props.projectId ?? null, criteria })
    toast.success('View saved')
    isSaveOpen.value = false
    name.value = ''
    await load()
  } catch (error) {
    toast.error(getErrorMessage(error))
  }
}

async function remove(filter: SavedFilter) {
  await savedFiltersApi.remove(filter.id)
  await load()
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="outline" size="sm"><Bookmark /> Views</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-60">
      <DropdownMenuLabel>Saved views</DropdownMenuLabel>
      <DropdownMenuItem v-for="filter in filters" :key="filter.id" class="group" @select="emit('apply', filter.criteria as Record<string, string>)">
        <span class="flex-1 truncate">{{ filter.name }}</span>
        <button type="button" class="opacity-0 group-hover:opacity-100" :aria-label="`Delete ${filter.name}`" @click.stop="remove(filter)">
          <Trash2 class="size-3.5" />
        </button>
      </DropdownMenuItem>
      <p v-if="!filters.length" class="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet</p>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="isSaveOpen = true">Save current filters…</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <Dialog v-model:open="isSaveOpen">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
      <form class="space-y-4" @submit.prevent="save">
        <Input v-model="name" placeholder="e.g. My open bugs" autofocus aria-label="View name" />
        <DialogFooter>
          <Button type="button" variant="outline" @click="isSaveOpen = false">Cancel</Button>
          <Button type="submit" :disabled="!name.trim()">Save</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
