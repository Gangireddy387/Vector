<script setup lang="ts">
/** `readonly` indents plain values so they line up with the text inside editable fields. */
defineProps<{ label: string; for?: string; readonly?: boolean }>()
</script>

<template>
  <div class="grid min-h-8 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 py-0.5">
    <label :for="$props.for" class="truncate text-[11px] font-medium text-muted-foreground">{{ label }}</label>
    <div class="min-w-0 text-sm" :class="readonly && 'flex min-h-7 items-center px-2'">
      <slot />
    </div>
  </div>
</template>
