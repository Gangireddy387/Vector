<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="mb-6 space-y-1.5 short:mb-4 short:space-y-1">
    <h1 class="text-3xl font-semibold tracking-tight short:text-2xl">{{ title }}</h1>
    <p v-if="description" class="text-sm text-muted-foreground">{{ description }}</p>
  </div>
</template>
