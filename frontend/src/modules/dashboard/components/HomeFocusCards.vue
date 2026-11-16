<script setup lang="ts">
import { AlertTriangle, ArrowRight, ListTodo, LoaderCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { toast } from 'vue-sonner'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { getErrorMessage } from '@/lib/http'
import { meetingsApi } from '@/modules/meetings/meetings.api'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import type { DashboardData, MeetingActionHomeItem } from '../dashboard.api'

const props = defineProps<{ data: DashboardData }>()
const emit = defineEmits<{ changed: [] }>()

const projects = useProjectsStore()
const ui = useUiStore()
const creatingId = ref<string | null>(null)
const cleared = ref(new Set<string>())

const actions = computed(() => (props.data.meetingActions ?? []).filter((item) => !cleared.value.has(item.meetingId)))
const rollup = computed(() => props.data.standupRollup ?? [])
const rollupAttention = computed(() => rollup.value.filter((row) => row.missing.length || row.blockers.length))
const hasAnything = computed(() => actions.value.length || rollup.value.length)

function projectFor(item: MeetingActionHomeItem) {
  if (item.contextType === 'project' && item.contextId) {
    const match = projects.projects.find((project) => project.id === item.contextId && !project.archivedAt)
    if (match) return match.id
  }
  return projects.projects.find((project) => !project.archivedAt)?.id ?? null
}

async function createAll(item: MeetingActionHomeItem) {
  const open = item.items ?? []
  if (!open.length) {
    window.location.assign(`/meetings/${item.meetingId}?focus=actions`)
    return
  }

  creatingId.value = item.meetingId
  try {
    await projects.fetchProjects().catch(() => undefined)
    const projectId = projectFor(item)
    if (!projectId) {
      toast.error('Create or join a project first', {
        description: 'Action items need a project. Open the meeting to pick one.',
        action: {
          label: 'Open meeting',
          onClick: () => {
            window.location.assign(`/meetings/${item.meetingId}?focus=actions`)
          },
        },
      })
      return
    }

    const result = await meetingsApi.createTasks(item.meetingId, {
      projectId,
      items: open.map((row) => ({
        index: row.index,
        title: row.text,
        assigneeId: row.ownerId,
        dueDate: row.due,
        priority: row.priority,
      })),
    })

    cleared.value = new Set([...cleared.value, item.meetingId])
    ui.notifyIssuesChanged()
    emit('changed')
    toast.success(`Created ${result.created.length} ${result.created.length === 1 ? 'task' : 'tasks'}`, {
      description: [
        result.created.map((task) => task.key).join(', '),
        result.unassigned.length ? 'Some owners aren’t in that project — those tasks are unassigned.' : 'Assigned and due dates applied where known.',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  } catch (error) {
    toast.error(getErrorMessage(error))
  } finally {
    creatingId.value = null
  }
}
</script>

<template>
  <section v-if="hasAnything" class="space-y-2.5">
    <!-- Meeting action items → tracked tasks (one click from Home) -->
    <div v-if="actions.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <ListTodo class="size-4 text-primary" />
        <h2 class="text-sm font-semibold">Meeting → tasks</h2>
        <span class="text-xs text-muted-foreground">Recap → owned work in one click</span>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="item in actions.slice(0, 4)" :key="item.meetingId" class="flex flex-col gap-2 px-4 py-2.5 sm:flex-row sm:items-start">
          <RouterLink
            :to="{ name: 'meeting-room', params: { meetingId: item.meetingId }, query: { focus: 'actions' } }"
            class="min-w-0 flex-1 transition-colors hover:text-primary"
          >
            <p class="truncate text-[13px] font-medium">{{ item.title }}</p>
            <p class="text-[12px] text-muted-foreground">
              {{ item.openCount }} open
              <template v-if="item.preview[0]"> · {{ item.preview[0] }}</template>
            </p>
          </RouterLink>
          <div class="flex shrink-0 flex-wrap gap-1.5">
            <Button
              size="sm"
              class="max-sm:flex-1"
              :disabled="creatingId === item.meetingId"
              @click="createAll(item)"
            >
              <LoaderCircle v-if="creatingId === item.meetingId" class="animate-spin" />
              <ListTodo v-else />
              Create {{ item.openCount }} {{ item.openCount === 1 ? 'task' : 'tasks' }}
            </Button>
            <Button size="sm" variant="ghost" class="text-muted-foreground" as-child>
              <RouterLink :to="{ name: 'meeting-room', params: { meetingId: item.meetingId }, query: { focus: 'actions' } }">
                Review
              </RouterLink>
            </Button>
          </div>
        </li>
      </ul>
    </div>

    <div v-if="rollup.length" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft">
      <header class="flex h-11 items-center gap-2 border-b border-border px-4">
        <AlertTriangle class="size-4 text-amber-600 dark:text-amber-400" />
        <h2 class="text-sm font-semibold">Standup rollup</h2>
        <span class="text-xs text-muted-foreground">Leads & admins</span>
        <Button variant="ghost" size="sm" class="ml-auto text-muted-foreground" as-child>
          <RouterLink :to="{ name: 'standup-rollup' }">Full view <ArrowRight /></RouterLink>
        </Button>
      </header>
      <ul class="divide-y divide-border/70">
        <li v-for="row in (rollupAttention.length ? rollupAttention : rollup).slice(0, 4)" :key="row.projectId">
          <RouterLink
            :to="{ name: 'project-standup', params: { projectId: row.projectId }, query: { date: row.date } }"
            class="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-accent/50"
          >
            <span class="mt-1.5 size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: row.projectColor }" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-[13px] font-medium">{{ row.projectName }}</p>
              <p class="text-[12px] text-muted-foreground">
                {{ row.posted }}/{{ row.expected }} posted
                <template v-if="row.missing.length"> · {{ row.missing.length }} missing</template>
                <template v-if="row.blockers.length"> · {{ row.blockers.length }} blocked</template>
              </p>
              <div v-if="row.missing.length" class="mt-1.5 flex -space-x-1.5">
                <UserAvatar v-for="person in row.missing.slice(0, 5)" :key="person.id" :user="person" size="xs" class="ring-2 ring-card" />
              </div>
            </div>
            <ArrowRight class="mt-1 size-3.5 shrink-0 text-muted-foreground" />
          </RouterLink>
        </li>
      </ul>
    </div>
  </section>
</template>
