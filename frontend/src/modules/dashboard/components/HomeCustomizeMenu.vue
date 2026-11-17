<script setup lang="ts">
import { RotateCcw, SlidersHorizontal } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { type HomeWidgetKey, HOME_WIDGETS } from '../composables/useHomeLayout'

defineProps<{ hidden: HomeWidgetKey[]; customized: boolean }>()
const emit = defineEmits<{ toggle: [key: HomeWidgetKey]; reset: [] }>()
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        class="shrink-0"
        :class="customized && 'border-primary/50 bg-primary/5 text-primary'"
        aria-label="Customize Home"
      >
        <SlidersHorizontal />
        <span class="hidden sm:inline">Customize</span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-72 p-0">
      <section class="space-y-1 border-b border-border p-3">
        <p class="mb-2 text-xs font-medium text-muted-foreground">Show on Home</p>
        <label
          v-for="widget in HOME_WIDGETS"
          :key="widget.key"
          class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60"
        >
          <span>{{ widget.label }}</span>
          <Switch :model-value="!hidden.includes(widget.key)" @update:model-value="emit('toggle', widget.key)" />
        </label>
      </section>
      <div class="p-2">
        <Button variant="ghost" size="sm" class="w-full justify-start" :disabled="!customized" @click="emit('reset')">
          <RotateCcw /> Reset layout
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
