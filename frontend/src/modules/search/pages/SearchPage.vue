<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { Search } from 'lucide-vue-next'
import { ref } from 'vue'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Input } from '@/components/ui/input'
import { useDevice } from '@/composables/useDevice'
import { type SearchResults, searchApi } from '../search.api'

const { isDesktop } = useDevice()

const query = ref('')
const results = ref<SearchResults | null>(null)
const isSearching = ref(false)

watchDebounced(
  query,
  async (value) => {
    if (!value.trim()) {
      results.value = null
      return
    }
    isSearching.value = true
    try {
      results.value = await searchApi.search(value.trim(), 20)
    } finally {
      isSearching.value = false
    }
  },
  { debounce: 250 },
)
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <div class="relative">
      <Search class="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" type="search" placeholder="Search tasks, projects, people" class="h-11 pl-9 text-base" autofocus aria-label="Search" />
    </div>

    <EmptyState v-if="!query.trim()" :icon="Search" title="Find anything" description="Search by task key (VEC-12), title, project or teammate." />
    <p v-else-if="isSearching && !results" class="text-center text-sm text-muted-foreground">Searching…</p>
    <template v-else-if="results">
      <EmptyState
        v-if="!results.issues.length && !results.projects.length && !results.people.length"
        title="No results"
        :description="`Nothing matches “${query}”.`"
      />

      <section v-if="results.issues.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">Tasks</h2>
        <ul class="min-w-0 divide-y overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="issue in results.issues" :key="issue.id">
            <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" class="flex flex-col gap-2 px-4 py-3 active:bg-muted sm:flex-row sm:items-center sm:gap-3">
              <span class="flex min-w-0 items-center gap-3">
                <IssueTypeIcon :type="issue.type" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ issue.title }}</span>
                  <span class="block text-xs text-muted-foreground">{{ issue.key }} · {{ issue.project.name }}</span>
                </span>
              </span>
              <StatusBadge :status="issue.status" class="shrink-0 self-start sm:self-center" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.projects.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">Projects</h2>
        <ul class="min-w-0 divide-y overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="project in results.projects" :key="project.id">
            <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }" class="flex min-w-0 items-center gap-3 px-4 py-3 active:bg-muted">
              <span class="size-3" :style="{ backgroundColor: project.color }" />
              <span class="flex-1 text-sm font-medium">{{ project.name }}</span>
              <span class="text-xs text-muted-foreground">{{ project.key }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.people.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">People</h2>
        <ul class="min-w-0 divide-y overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="person in results.people" :key="person.id">
            <RouterLink :to="{ name: 'issues', query: { assigneeId: person.id } }" class="flex min-w-0 items-center gap-3 px-4 py-3 active:bg-muted">
              <UserAvatar :user="person" size="md" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ person.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ person.email }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
