<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import GlobalSearch from './GlobalSearch.vue'
import NotificationBell from '@/modules/notifications/components/NotificationBell.vue'
import { useUiStore } from '@/stores/ui.store'

const ui = useUiStore()
const route = useRoute()

const openCreateIssue = () =>
  ui.openCreateIssue({ projectId: typeof route.params.projectId === 'string' ? route.params.projectId : undefined })
</script>

<template>
  <header class="glass relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
    <GlobalSearch />
    <div class="ml-auto flex items-center gap-1">
      <Button size="sm" variant="soft" @click="openCreateIssue"><Plus /> Create</Button>
      <NotificationBell />
    </div>
  </header>
</template>
