<script setup lang="ts">
import { Flag, Layers, Rows3, RotateCcw, SlidersHorizontal, SquareStack, UserRound, Zap } from 'lucide-vue-next'
import SegmentedControl from '@/components/common/SegmentedControl.vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import type { BoardCardFields, BoardDensity, BoardGroupBy, BoardViewState } from '../composables/useBoardView'

/** The board's "Display" options, like Linear: swimlanes, card density and which details cards show. */
defineProps<{ view: BoardViewState; customized: boolean }>()
const emit = defineEmits<{
  groupBy: [value: BoardGroupBy]
  density: [value: BoardDensity]
  field: [field: keyof BoardCardFields, value: boolean]
  reset: []
}>()

const GROUPS: Array<{ value: BoardGroupBy; label: string; icon: typeof Rows3 }> = [
  { value: 'none', label: 'None', icon: Rows3 },
  { value: 'assignee', label: 'Assignee', icon: UserRound },
  { value: 'priority', label: 'Priority', icon: Flag },
  { value: 'type', label: 'Type', icon: SquareStack },
  { value: 'epic', label: 'Epic', icon: Zap },
]
const DENSITIES: Array<{ value: BoardDensity; label: string }> = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
]
const FIELDS: Array<{ key: keyof BoardCardFields; label: string }> = [
  { key: 'key', label: 'Key and type' },
  { key: 'priority', label: 'Priority' },
  { key: 'epic', label: 'Epic' },
  { key: 'labels', label: 'Labels' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'counts', label: 'Sub-tasks, comments, files' },
  { key: 'points', label: 'Story points' },
  { key: 'assignee', label: 'Assignee' },
]
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="shrink-0"
        :class="customized && 'border-primary/50 bg-primary/5 text-primary'"
        aria-label="Display"
      >
        <SlidersHorizontal />
        <span class="hidden sm:inline">Display</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-[min(20rem,calc(100vw-1.5rem))] p-0">
      <section class="space-y-2 border-b border-border p-3">
        <p class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Layers class="size-3.5" /> Swimlanes</p>
        <div class="grid grid-cols-3 gap-1 sm:grid-cols-5" role="radiogroup" aria-label="Group the board into swimlanes by">
          <button
            v-for="option in GROUPS"
            :key="option.value"
            type="button"
            role="radio"
            :aria-checked="view.groupBy === option.value"
            class="flex flex-col items-center gap-1 rounded-md border px-1 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            :class="view.groupBy === option.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-input hover:text-foreground'"
            @click="emit('groupBy', option.value)"
          >
            <component :is="option.icon" class="size-4" />
            {{ option.label }}
          </button>
        </div>
      </section>

      <section class="space-y-2 border-b border-border p-3">
        <p class="text-xs font-medium text-muted-foreground">Card size</p>
        <SegmentedControl
          grow
          size="sm"
          aria-label="Card size"
          :model-value="view.density"
          :options="DENSITIES"
          @update:model-value="(value) => emit('density', value as BoardDensity)"
        />
      </section>

      <section class="space-y-1 p-3">
        <p class="pb-1 text-xs font-medium text-muted-foreground">Show on cards</p>
        <label v-for="field in FIELDS" :key="field.key" class="flex cursor-pointer items-center justify-between rounded-md px-1 py-1 text-[13px] hover:bg-accent/50">
          {{ field.label }}
          <Switch :model-value="view.fields[field.key]" :aria-label="`Show ${field.label.toLowerCase()}`" @update:model-value="(value: boolean) => emit('field', field.key, value)" />
        </label>
      </section>

      <div v-if="customized" class="border-t border-border p-2">
        <Button variant="ghost" size="sm" class="w-full" @click="emit('reset')"><RotateCcw /> Reset to default</Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
