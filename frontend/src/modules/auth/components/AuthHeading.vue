<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-5 space-y-1.5 short:mb-4 short:space-y-1 sm:mb-6">
    <h1 class="text-[1.65rem] leading-tight font-semibold tracking-tight sm:text-3xl short:text-2xl">{{ title }}</h1>
    <p v-if="description" class="text-[13px] leading-relaxed text-muted-foreground sm:text-sm">{{ description }}</p>
  </div>
</template>
