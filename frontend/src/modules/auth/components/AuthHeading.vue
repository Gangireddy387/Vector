<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-3 space-y-1 short:mb-2.5 sm:mb-4">
    <h1 class="text-[1.5rem] leading-tight font-semibold tracking-tight sm:text-[1.75rem] short:text-[1.35rem]">{{ title }}</h1>
    <p v-if="description" class="text-[12.5px] leading-snug text-muted-foreground sm:text-[13px]">{{ description }}</p>
  </div>
</template>
