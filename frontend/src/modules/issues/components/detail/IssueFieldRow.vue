<script setup lang="ts">
/** `readonly` indents plain values so they line up with the text inside editable fields. */
defineProps<{ label: string; for?: string; readonly?: boolean }>()
</script>

<template>
  <div class="grid min-h-9 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 py-0.5">
    <label :for="$props.for" class="text-xs font-medium text-muted-foreground">{{ label }}</label>
    <div class="min-w-0 text-sm" :class="readonly && 'flex min-h-8 items-center px-3'">
      <slot />
    </div>
  </div>
</template>
