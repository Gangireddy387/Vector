<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ items: Array<{ label: string; to?: RouteLocationRaw }> }>()
</script>

<template>
  <nav aria-label="Breadcrumb" class="flex min-w-0 flex-wrap items-center gap-1 text-xs font-medium text-muted-foreground">
    <template v-for="(item, index) in items" :key="index">
      <ChevronRight v-if="index" class="size-3.5 shrink-0 opacity-60" />
      <RouterLink v-if="item.to" :to="item.to" class="truncate transition-colors hover:text-foreground">{{ item.label }}</RouterLink>
      <span v-else class="truncate text-foreground" aria-current="page">{{ item.label }}</span>
    </template>
  </nav>
</template>
