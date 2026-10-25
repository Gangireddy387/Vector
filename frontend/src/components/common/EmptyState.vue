<script setup lang="ts">
import type { Component } from 'vue'
import { cn } from '@/lib/utils'

const props = defineProps<{ icon?: Component; title: string; description?: string; class?: string }>()
</script>

<template>
  <div :class="cn('flex flex-col items-center justify-center gap-3 px-4 py-10 text-center', props.class)">
    <div v-if="icon" class="relative flex size-12 items-center justify-center bg-primary/10 text-primary ring-6 ring-primary/5">
      <component :is="icon" class="size-6" />
    </div>
    <div class="space-y-1">
      <p class="font-medium">{{ title }}</p>
      <p v-if="description" class="mx-auto max-w-sm text-sm text-muted-foreground">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
