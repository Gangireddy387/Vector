<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Kanban, ExternalLink } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getErrorMessage } from '@/lib/http'
import { structureApi } from '@/modules/departments/departments.api'
import type { TeamWork } from '@/types/models'
import type { ConversationSummary } from '../messages.api'

const props = defineProps<{ conversation: ConversationSummary }>()
const router = useRouter()
const work = ref<TeamWork | null>(null)
const loading = ref(false)

const teamId = computed(() => props.conversation.team?.id ?? null)
const projects = computed(() => work.value?.projects ?? [])

watch(
  teamId,
  async (id) => {
    work.value = null
    if (!id) return
    loading.value = true
    try {
      work.value = await structureApi.teamWork(id)
    } catch (error) {
      toast.error(getErrorMessage(error))
      work.value = { projects: [], totals: { total: 0, todo: 0, inProgress: 0, done: 0, overdue: 0 }, otherProjects: [] }
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const openBoard = (projectId: string) => void router.push({ name: 'project-board', params: { projectId } })
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-sidebar/40 px-3 py-3 scrollbar-thin sm:px-4 sm:py-4">
    <div class="w-full space-y-3">
      <div class="flex items-start gap-3">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Kanban class="size-[18px]" /></span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold">Board</p>
          <p class="text-xs text-muted-foreground">
            Projects owned by {{ conversation.team?.name ?? 'this team' }}. Open a board without leaving Messages.
          </p>
        </div>
      </div>

      <template v-if="loading || work === null">
        <Skeleton v-for="index in 3" :key="index" class="h-16 w-full rounded-xl" />
      </template>
      <p v-else-if="!projects.length" class="rounded-xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
        This team has no projects yet. Assign one from the team page to track work beside this channel.
      </p>
      <button
        v-for="project in projects"
        :key="project.id"
        type="button"
        class="flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left shadow-soft transition-colors hover:bg-accent/40 sm:px-4"
        @click="openBoard(project.id)"
      >
        <span class="size-3 shrink-0 rounded-full" :style="{ background: project.color }" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13.5px] font-semibold">{{ project.name }}</span>
          <span class="block text-[11.5px] text-muted-foreground">
            {{ project.key }} · {{ project.work.todo + project.work.inProgress }} open · {{ project.work.done }} done
          </span>
        </span>
        <Button size="sm" variant="secondary" class="shrink-0" tabindex="-1">
          <ExternalLink class="size-3.5" />
          <span class="max-sm:hidden">Open board</span>
        </Button>
      </button>
    </div>
  </div>
</template>
