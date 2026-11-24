<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import GlobalSearch from './GlobalSearch.vue'
import NotificationBell from '@/modules/notifications/components/NotificationBell.vue'
import { useUiStore } from '@/stores/ui.store'
import TimerChip from './TimerChip.vue'

const ui = useUiStore()
const route = useRoute()

const openCreateIssue = () =>
  ui.openCreateIssue({ projectId: typeof route.params.projectId === 'string' ? route.params.projectId : undefined })
</script>

<template>
  <header class="relative z-40 flex h-12 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-2.5 backdrop-blur-md sm:gap-3 sm:px-3">
    <!-- Thin brand accent — ties the raised panel to the marketing gradient. -->
    <div
      class="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent"
      aria-hidden="true"
    />
    <GlobalSearch />
    <div class="ml-auto flex shrink-0 items-center gap-1.5">
      <TimerChip />
      <Button
        size="sm"
        variant="outline"
        class="border-primary/25 bg-primary/[0.05] hover:bg-primary/[0.1]"
        @click="openCreateIssue"
      >
        <Plus class="text-primary" /> <span class="hidden sm:inline">Create</span>
      </Button>
      <NotificationBell />
    </div>
  </header>
</template>
