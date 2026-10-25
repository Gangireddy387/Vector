<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { getProjectNavigation } from '@/components/layout/projectNavigation'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { useUiStore } from '@/stores/ui.store'
import { useProjectsStore } from '../projects.store'

const props = defineProps<{ projectId: string }>()

const projects = useProjectsStore()
const ui = useUiStore()
const { isDesktop } = useDevice()
const notFound = ref(false)

const project = computed(() => projects.details[props.projectId])
const navigation = computed(() => (project.value ? getProjectNavigation(project.value) : []))

watch(
  () => props.projectId,
  async (projectId) => {
    projects.currentProjectId = projectId
    notFound.value = false
    try {
      await projects.fetchProject(projectId, true)
    } catch {
      notFound.value = true
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => (projects.currentProjectId = null))
</script>

<template>
  <EmptyState v-if="notFound" title="Project not found" description="It may have been deleted or you no longer have access." class="py-20">
    <Button as-child variant="outline"><RouterLink :to="{ name: 'projects' }">All projects</RouterLink></Button>
  </EmptyState>

  <div v-else-if="!project" class="space-y-4 p-6">
    <Skeleton class="h-8 w-64" />
    <Skeleton class="h-96 w-full" />
  </div>

  <div v-else class="flex min-h-full flex-col" :class="isDesktop && 'h-full'">
    <!-- Desktop header -->
    <header v-if="isDesktop" class="shrink-0 border-b px-5 pt-3">
      <div class="flex items-center gap-3">
        <span class="flex size-8 items-center justify-center text-xs font-bold text-white" :style="{ backgroundColor: project.color }">
          {{ project.key.slice(0, 2) }}
        </span>
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold">{{ project.name }}</h1>
        </div>
        <UserAvatarStack :users="project.members" :max="5" class="ml-2" />
        <Button size="sm" class="ml-auto" @click="ui.openCreateIssue({ projectId: project.id })"><Plus /> Issue</Button>
      </div>
      <nav class="mt-2 -mb-px flex gap-1" aria-label="Project sections">
        <RouterLink
          v-for="item in navigation"
          :key="item.name"
          v-slot="{ href, navigate, isActive }"
          :to="{ name: item.name, params: { projectId: project.id } }"
          custom
        >
          <a
            :href="href"
            class="flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors"
            :class="isActive ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'"
            :aria-current="isActive ? 'page' : undefined"
            @click="navigate"
          >
            <component :is="item.icon" class="size-4" /> {{ item.label }}
          </a>
        </RouterLink>
      </nav>
    </header>

    <!-- Mobile section switcher -->
    <nav v-else class="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex gap-1.5 overflow-x-auto border-b bg-background px-3 py-2 scrollbar-none" aria-label="Project sections">
      <RouterLink
        v-for="item in navigation"
        :key="item.name"
        v-slot="{ href, navigate, isActive }"
        :to="{ name: item.name, params: { projectId: project.id } }"
        custom
      >
        <a
          :href="href"
          class="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
          :class="isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
          :aria-current="isActive ? 'page' : undefined"
          @click="navigate"
        >
          <component :is="item.icon" class="size-4" /> {{ item.label }}
        </a>
      </RouterLink>
    </nav>

    <div class="min-h-0 flex-1" :class="isDesktop && 'overflow-y-auto'">
      <RouterView />
    </div>
  </div>
</template>
