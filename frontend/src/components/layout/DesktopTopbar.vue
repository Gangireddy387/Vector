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
  <header class="relative z-40 flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-background/85 px-2.5 backdrop-blur-md sm:gap-3 sm:px-3">
    <GlobalSearch />
    <div class="ml-auto flex shrink-0 items-center gap-1.5">
      <TimerChip />
      <Button size="sm" variant="outline" @click="openCreateIssue"><Plus /> <span class="hidden sm:inline">Create</span></Button>
      <NotificationBell />
    </div>
  </header>
</template>
