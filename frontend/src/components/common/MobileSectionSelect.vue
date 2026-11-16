<script setup lang="ts">
import type { Component } from 'vue'
import { computed } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface MobileSectionOption {
  value: string
  label: string
  icon?: Component
  count?: number | string
}

const props = defineProps<{
  options: MobileSectionOption[]
  ariaLabel?: string
}>()

const active = defineModel<string>({ required: true })

const current = computed(() => props.options.find((option) => option.value === active.value) ?? props.options[0] ?? null)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        variant="outline"
        class="h-10 w-full min-w-0 justify-between gap-2 rounded-xl px-3 sm:h-9"
        :aria-label="ariaLabel ?? 'Choose section'"
      >
        <span class="flex min-w-0 items-center gap-2">
          <component :is="current.icon" v-if="current?.icon" class="size-4 shrink-0 text-primary" />
          <span class="truncate font-medium">{{ current?.label ?? 'Select' }}</span>
          <span
            v-if="current?.count != null"
            class="rounded-full bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums"
          >
            {{ current.count }}
          </span>
        </span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-[min(18rem,calc(100vw-1.5rem))]">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        class="justify-between gap-3"
        :class="option.value === active && 'bg-accent'"
        @select="active = option.value"
      >
        <span class="flex min-w-0 items-center gap-2">
          <component :is="option.icon" v-if="option.icon" class="size-4 shrink-0" />
          <span class="truncate">{{ option.label }}</span>
        </span>
        <span v-if="option.count != null" class="text-xs text-muted-foreground tabular-nums">{{ option.count }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
