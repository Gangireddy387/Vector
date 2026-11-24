<script setup lang="ts">
/** `readonly` indents plain values so they line up with the text inside editable fields. */
defineProps<{ label: string; for?: string; readonly?: boolean }>()
</script>

<template>
  <div
    class="issue-field-row group/field grid min-h-9 grid-cols-[5.75rem_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5 rounded-lg px-1 py-0.5 transition-colors duration-150 hover:bg-accent/40"
  >
    <label
      :for="$props.for"
      class="truncate text-[11px] font-medium tracking-wide text-muted-foreground transition-colors group-hover/field:text-foreground/70"
    >
      {{ label }}
    </label>
    <div class="min-w-0 text-sm" :class="readonly && 'flex min-h-7 items-center px-2'">
      <slot />
    </div>
  </div>
</template>
