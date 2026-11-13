<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { Label } from '@/types/models'

defineProps<{ label: Pick<Label, 'name' | 'color'>; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <span class="inline-flex h-5 items-center gap-1.5 rounded-full border border-border bg-card px-2 text-[11px] font-medium text-foreground/80">
    <span class="size-1.5 shrink-0 rounded-full" :style="{ backgroundColor: label.color }" />
    {{ label.name }}
    <button v-if="removable" type="button" class="-mr-1 rounded-full p-0.5 hover:bg-muted" :aria-label="`Remove ${label.name}`" @click.stop="$emit('remove')">
      <X class="size-3" />
    </button>
  </span>
</template>
