<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <!-- Phones show the page name in the top bar already -->
    <div class="min-w-0 max-sm:hidden">
      <slot name="eyebrow" />
      <h1 class="truncate text-[20px] leading-tight font-semibold tracking-tight">{{ title }}</h1>
      <p v-if="description" class="mt-1 max-w-3xl text-[13px] text-muted-foreground">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="flex shrink-0 flex-wrap items-center gap-2 max-sm:[&>*]:flex-1">
      <slot name="actions" />
    </div>
  </header>
</template>
