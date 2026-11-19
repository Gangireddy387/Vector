<script setup lang="ts">
import { ClipboardList, MessageCircle, UsersRound } from 'lucide-vue-next'
import { computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import UserAvatarStack from '@/components/common/UserAvatarStack.vue'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/forms'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useMessagesStore } from '@/modules/messages/messages.store'
import type { DashboardData } from '../dashboard.api'
import { useMyTeamHome } from '../composables/useMyTeamHome'

const props = defineProps<{ data?: DashboardData | null }>()

const auth = useAuthStore()
const messages = useMessagesStore()
const { teams, primary, projects, selectedTeamId, loaded, load, selectTeam } = useMyTeamHome()

onMounted(() => {
  void load()
  if ((auth.hasFeature('teamChat') || auth.hasFeature('directMessages')) && !messages.conversations) {
    void messages.load().catch(() => undefined)
  }
})

const show = computed(() => loaded.value && teams.value.length > 0 && Boolean(primary.value))

const teamOptions = computed(() =>
  teams.value.map((team) => ({
    value: team.id,
    label: teams.value.length > 1 ? `${team.name} · ${team.departmentName}` : team.name,
  })),
)

const people = computed(() => {
  const team = primary.value
  if (!team) return []
  const list = [...team.members]
  if (team.lead && !list.some((person) => person.id === team.lead!.id)) list.unshift(team.lead)
  return list
})

const teamChat = computed(() => {
  const teamId = primary.value?.id
  if (!teamId || !messages.conversations) return null
  return messages.conversations.find((conversation) => conversation.kind === 'team' && conversation.team?.id === teamId) ?? null
})

const standupLink = computed(() => {
  if (!auth.hasFeature('chat') || !primary.value) return null
  const projectIds = new Set(projects.value.map((project) => project.id))
  const pending = (props.data?.standupPending ?? []).find((item) => projectIds.has(item.projectId))
  const projectId = pending?.projectId ?? projects.value[0]?.id
  if (!projectId) return null
  return {
    name: 'project-standup' as const,
    params: { projectId },
    query: pending?.date ? { date: pending.date } : undefined,
  }
})

const visibleProjects = computed(() => projects.value.slice(0, 4))
</script>

<template>
  <section v-if="show && primary" class="overflow-hidden rounded-xl border border-border bg-card shadow-soft" aria-label="My team">
    <header class="flex flex-wrap items-start gap-2.5 border-b border-border px-3 py-3 sm:items-center sm:px-4">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-400">
        <UsersRound class="size-4" />
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-sm font-semibold">My team</h2>
          <SelectField
            v-if="teams.length > 1"
            :model-value="selectedTeamId"
            :options="teamOptions"
            class="h-8 w-48"
            aria-label="Choose team"
            @update:model-value="(value) => value && selectTeam(value)"
          />
          <RouterLink
            v-else
            :to="{ name: 'team', params: { teamId: primary.id } }"
            class="truncate text-sm font-medium text-primary hover:underline"
          >
            {{ primary.name }}
          </RouterLink>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">
          {{ primary.departmentName }}
          <template v-if="primary.lead"> · Lead {{ primary.lead.name }}</template>
          · {{ people.length }} people
        </p>
      </div>
      <UserAvatarStack :users="people" :max="5" class="shrink-0" />
    </header>

    <div class="space-y-3 px-3 py-3 sm:px-4">
      <ul v-if="visibleProjects.length" class="space-y-1.5">
        <li v-for="project in visibleProjects" :key="project.id" class="flex items-center gap-2 text-sm">
          <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ backgroundColor: project.color }" />
          <RouterLink
            :to="{ name: 'project-board', params: { projectId: project.id } }"
            class="min-w-0 flex-1 truncate hover:underline"
          >
            {{ project.name }}
          </RouterLink>
          <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
            {{ project.work.todo + project.work.inProgress }} open
          </span>
        </li>
      </ul>
      <p v-else class="text-xs text-muted-foreground">No projects on this team yet.</p>

      <div class="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'team', params: { teamId: primary.id } }">Open team</RouterLink>
        </Button>
        <Button v-if="teamChat" size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'messages', params: { conversationId: teamChat.id } }">
            <MessageCircle /> Team chat
          </RouterLink>
        </Button>
        <Button v-else-if="auth.hasFeature('teamChat')" size="sm" variant="outline" as-child>
          <RouterLink :to="{ name: 'messages' }"><MessageCircle /> Messages</RouterLink>
        </Button>
        <Button v-if="standupLink" size="sm" variant="outline" as-child>
          <RouterLink :to="standupLink"><ClipboardList /> Standup</RouterLink>
        </Button>
      </div>
    </div>
  </section>
</template>
