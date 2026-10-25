<script setup lang="ts">
import { FolderKanban, Plus, Users } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { formatDate } from '@/lib/format'
import CreateProjectDialog from '../components/CreateProjectDialog.vue'
import { useProjectsStore } from '../projects.store'

const projects = useProjectsStore()
const route = useRoute()
const { isDesktop } = useDevice()
const isLoading = ref(!projects.projects.length)
const isCreateOpen = ref(route.query.welcome === '1')

onMounted(async () => {
  await projects.fetchProjects(true)
  isLoading.value = false
})

const completion = (summary?: { total: number; done: number }) => (summary?.total ? Math.round((summary.done / summary.total) * 100) : 0)
</script>

<template>
  <div class="w-full space-y-4" :class="isDesktop ? 'p-5' : 'p-3'">
    <PageHeader v-if="isDesktop" title="Projects" description="Every project you are a member of.">
      <template #actions>
        <Button @click="isCreateOpen = true"><Plus /> New project</Button>
      </template>
    </PageHeader>
    <Button v-else class="w-full" @click="isCreateOpen = true"><Plus /> New project</Button>

    <div v-if="isLoading" class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Skeleton v-for="index in 3" :key="index" class="h-40" />
    </div>

    <EmptyState
      v-else-if="!projects.activeProjects.length"
      :icon="FolderKanban"
      title="Create your first project"
      description="Projects hold your board, backlog, automation rules and reports."
    >
      <Button @click="isCreateOpen = true"><Plus /> New project</Button>
    </EmptyState>

    <div v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <RouterLink
        v-for="project in projects.activeProjects"
        :key="project.id"
        :to="{ name: 'project-board', params: { projectId: project.id } }"
        class="surface-hover group flex flex-col gap-4 border border-border/70 bg-card p-5 shadow-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center text-sm font-bold text-white" :style="{ backgroundColor: project.color }">
            {{ project.key.slice(0, 2) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="truncate font-semibold group-hover:text-primary">{{ project.name }}</p>
            <p class="text-xs text-muted-foreground">{{ project.key }} · {{ project.type === 'scrum' ? 'Scrum' : 'Kanban' }}</p>
          </div>
          <Badge variant="secondary" class="capitalize">{{ project.myRole }}</Badge>
        </div>
        <p v-if="project.description" class="line-clamp-2 text-sm text-muted-foreground">{{ project.description }}</p>
        <div class="mt-auto space-y-2">
          <div class="flex justify-between text-xs text-muted-foreground">
            <span>{{ project.issueSummary?.open ?? 0 }} open · {{ project.issueSummary?.done ?? 0 }} done</span>
            <span>{{ completion(project.issueSummary) }}%</span>
          </div>
          <Progress :model-value="completion(project.issueSummary)" class="h-1.5" />
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span class="flex items-center gap-1.5"><UserAvatar :user="project.lead" size="xs" /> {{ project.lead?.name ?? 'No lead' }}</span>
            <span class="flex items-center gap-1"><Users class="size-3.5" /> {{ project.memberCount }}</span>
          </div>
          <p v-if="project.activeSprint" class="text-xs text-success">
            {{ project.activeSprint.name }} · ends {{ formatDate(project.activeSprint.endDate, 'd MMM') }}
          </p>
        </div>
      </RouterLink>
    </div>

    <CreateProjectDialog v-model:open="isCreateOpen" />
  </div>
</template>
