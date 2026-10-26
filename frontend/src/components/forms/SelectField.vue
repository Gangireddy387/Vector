<script setup lang="ts">
import { Check, ChevronsUpDown, Search } from 'lucide-vue-next'
import { PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger } from 'reka-ui'
import { computed, nextTick, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import { type FieldSize, fieldPanelClass, fieldTriggerVariants } from './field-styles'
import type { SelectFieldOption } from './select-field.types'
import SelectFieldVisual from './SelectFieldVisual.vue'

/**
 * Custom dropdown field: keyboard navigable, optional search, rich options
 * (avatars, icons, colour swatches, descriptions) and grouped sections.
 */
const props = withDefaults(
  defineProps<{
    options: SelectFieldOption[]
    placeholder?: string
    searchable?: boolean
    searchPlaceholder?: string
    emptyText?: string
    disabled?: boolean
    size?: FieldSize
    id?: string
    ariaLabel?: string
    class?: string
    contentClass?: string
    align?: 'start' | 'center' | 'end'
  }>(),
  {
    placeholder: 'Select…',
    searchable: undefined,
    searchPlaceholder: 'Search…',
    emptyText: 'No matches',
    size: 'default',
    align: 'start',
  },
)
const model = defineModel<string | null | undefined>()
const emit = defineEmits<{ change: [value: string | null] }>()

const open = ref(false)
const query = ref('')
const highlighted = ref(0)
const searchInput = ref<HTMLInputElement | null>(null)
const listbox = ref<HTMLElement | null>(null)

const isSearchable = computed(() => props.searchable ?? props.options.length > 7)
const selected = computed(() => props.options.find((option) => option.value === (model.value ?? null)))

const filtered = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return props.options
  return props.options.filter((option) => `${option.label} ${option.description ?? ''}`.toLowerCase().includes(term))
})

const showGroupHeader = (index: number) => {
  const group = filtered.value[index]?.group
  return Boolean(group) && filtered.value[index - 1]?.group !== group
}

function select(option: SelectFieldOption) {
  if (option.disabled) return
  model.value = option.value
  emit('change', option.value)
  open.value = false
}

function move(step: number) {
  const count = filtered.value.length
  if (!count) return
  let next = highlighted.value
  for (let attempt = 0; attempt < count; attempt += 1) {
    next = (next + step + count) % count
    if (!filtered.value[next]?.disabled) break
  }
  highlighted.value = next
  void nextTick(() => listbox.value?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' }))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') move(1)
  else if (event.key === 'ArrowUp') move(-1)
  else if (event.key === 'Home') highlighted.value = 0
  else if (event.key === 'End') highlighted.value = filtered.value.length - 1
  else if (event.key === 'Enter') {
    const option = filtered.value[highlighted.value]
    if (option) select(option)
  } else return
  event.preventDefault()
}

/** Long lists (like times of day) open at the chosen option instead of at the top. */
function onOpenAutoFocus(event: Event) {
  event.preventDefault()
  void nextTick(() => {
    ;(isSearchable.value ? searchInput.value : listbox.value)?.focus()
    listbox.value?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'center' })
  })
}

watch(open, (isOpen) => {
  if (!isOpen) return
  query.value = ''
  highlighted.value = Math.max(0, props.options.findIndex((option) => option.value === (model.value ?? null)))
})
watch(query, () => (highlighted.value = 0))
</script>

<template>
  <PopoverRoot v-model:open="open">
    <PopoverTrigger as-child>
      <button
        :id="id"
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        :aria-expanded="open"
        :aria-label="ariaLabel"
        :disabled="disabled"
        :data-state="open ? 'open' : 'closed'"
        :class="cn(fieldTriggerVariants({ size }), 'justify-between', props.class)"
        @keydown.down.prevent="open = true"
      >
        <span class="flex min-w-0 items-center gap-2">
          <slot name="value" :option="selected">
            <SelectFieldVisual v-if="selected" :option="selected" />
            <span class="truncate" :class="!selected && 'text-muted-foreground'">{{ selected?.label ?? placeholder }}</span>
          </slot>
        </span>
        <ChevronsUpDown class="size-3.5 shrink-0 text-muted-foreground transition-transform" :class="open && 'text-primary'" />
      </button>
    </PopoverTrigger>

    <PopoverPortal>
      <PopoverContent
        :align="align"
        :side-offset="4"
        :class="cn(fieldPanelClass, 'w-(--reka-popover-trigger-width) min-w-56 p-0', contentClass)"
        @open-auto-focus="onOpenAutoFocus"
      >
        <div v-if="isSearchable" class="flex items-center gap-2 border-b border-border/70 px-3">
          <Search class="size-4 text-muted-foreground" />
          <input
            ref="searchInput"
            v-model="query"
            class="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            :placeholder="searchPlaceholder"
            aria-label="Search options"
            @keydown="onKeydown"
          />
        </div>
        <ul ref="listbox" role="listbox" tabindex="-1" class="max-h-72 overflow-y-auto py-1 outline-none" @keydown="onKeydown">
          <template v-for="(option, index) in filtered" :key="`${option.value}-${index}`">
            <li v-if="showGroupHeader(index)" role="presentation" class="px-3 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-wider text-muted-foreground uppercase">
              {{ option.group }}
            </li>
            <li
              role="option"
              :aria-selected="option.value === (model ?? null)"
              :aria-disabled="option.disabled || undefined"
              :data-highlighted="index === highlighted"
              class="relative flex cursor-pointer items-center gap-2.5 border-l-2 px-3 py-2 text-sm transition-colors select-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[highlighted=true]:bg-accent data-[highlighted=true]:text-accent-foreground"
              :class="option.value === (model ?? null) ? 'border-primary bg-primary/5 font-medium' : 'border-transparent'"
              @mouseenter="highlighted = index"
              @click="select(option)"
            >
              <slot name="option" :option="option" :selected="option.value === (model ?? null)">
                <SelectFieldVisual :option="option" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate">{{ option.label }}</span>
                  <span v-if="option.description" class="block truncate text-xs font-normal text-muted-foreground">{{ option.description }}</span>
                </span>
              </slot>
              <Check v-if="option.value === (model ?? null)" class="size-4 shrink-0 text-primary" />
            </li>
          </template>
          <li v-if="!filtered.length" class="px-3 py-6 text-center text-sm text-muted-foreground">{{ emptyText }}</li>
        </ul>
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>
