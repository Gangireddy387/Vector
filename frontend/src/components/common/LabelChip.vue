<script setup lang="ts">
import { X } from 'lucide-vue-next'
import type { Label } from '@/types/models'

defineProps<{ label: Pick<Label, 'name' | 'color'>; removable?: boolean }>()
defineEmits<{ remove: [] }>()
</script>

<template>
  <span
    class="inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium"
    :style="{ borderColor: `${label.color}55`, color: label.color, backgroundColor: `${label.color}12` }"
  >
    {{ label.name }}
    <button v-if="removable" type="button" class="-mr-1 p-0.5 hover:bg-black/5" :aria-label="`Remove ${label.name}`" @click.stop="$emit('remove')">
      <X class="size-3" />
    </button>
  </span>
</template>
