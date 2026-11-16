<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'
import { Clock, Search } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PageHeader from '@/components/common/PageHeader.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDevice } from '@/composables/useDevice'
import { latestRequest } from '@/lib/latest'
import { matchFieldLabel } from '@/modules/issues/lib/saved-filter-criteria'
import { type SearchResults, type SearchScope, searchApi } from '../search.api'
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../search-recent'

const SCOPES: Array<{ value: SearchScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'issues', label: 'Tasks' },
  { value: 'projects', label: 'Projects' },
  { value: 'people', label: 'People' },
]

const { isDesktop } = useDevice()
const route = useRoute()
const router = useRouter()

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const scope = ref<SearchScope>(
  typeof route.query.scope === 'string' && SCOPES.some((item) => item.value === route.query.scope)
    ? (route.query.scope as SearchScope)
    : 'all',
)
const results = ref<SearchResults | null>(null)
const isSearching = ref(false)
const recent = ref(readRecentSearches())

const latest = latestRequest()
const totalHits = computed(() => {
  if (!results.value) return 0
  return results.value.issues.length + results.value.projects.length + results.value.people.length
})

function syncUrl() {
  const next = {
    ...route.query,
    q: query.value.trim() || undefined,
    scope: scope.value === 'all' ? undefined : scope.value,
  }
  void router.replace({ query: next })
}

watch([query, scope], syncUrl)

watchDebounced(
  [query, scope],
  async ([value]) => {
    const term = String(value ?? '').trim()
    if (!term) {
      latest.start()
      results.value = null
      isSearching.value = false
      return
    }
    const ticket = latest.start()
    isSearching.value = true
    try {
      const found = await searchApi.search(term, 20, scope.value)
      if (!latest.isCurrent(ticket)) return
      results.value = found
      recent.value = rememberSearch(term)
    } catch {
      if (latest.isCurrent(ticket)) results.value = null
    } finally {
      if (latest.isCurrent(ticket)) isSearching.value = false
    }
  },
  { debounce: 250 },
)

onMounted(() => {
  if (query.value.trim()) recent.value = rememberSearch(query.value)
})

function useRecent(term: string) {
  query.value = term
}

function clearRecent() {
  clearRecentSearches()
  recent.value = []
}

const rowClass =
  'flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 active:bg-muted'
</script>

<template>
  <div class="w-full space-y-4 sm:space-y-5" :class="isDesktop ? 'p-4 sm:p-5 lg:p-6' : 'p-3'">
    <PageHeader v-if="isDesktop" title="Search" description="Find tasks by key, title, description, comments or labels — plus projects and people." />

    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" type="search" placeholder="Search tasks, projects, people" class="h-11 pl-9 text-base" autofocus aria-label="Search" />
    </div>

    <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Search scope">
      <Button
        v-for="item in SCOPES"
        :key="item.value"
        type="button"
        size="sm"
        variant="outline"
        role="tab"
        :aria-selected="scope === item.value"
        :class="scope === item.value && 'border-primary/40 bg-primary/5 text-foreground'"
        @click="scope = item.value"
      >
        {{ item.label }}
      </Button>
    </div>

    <EmptyState
      v-if="!query.trim()"
      :icon="Search"
      title="Find anything"
      description="Try a task key (VEC-12), words from the description or a comment, a label name, a project, or a teammate."
      class="rounded-xl border border-dashed border-border/80 bg-card/60 py-10"
    >
      <div v-if="recent.length" class="mx-auto mt-4 w-full max-w-md space-y-2 text-left">
        <div class="flex items-center justify-between px-1">
          <p class="text-xs font-medium text-muted-foreground">Recent</p>
          <button type="button" class="text-xs text-muted-foreground hover:text-foreground" @click="clearRecent">Clear</button>
        </div>
        <ul class="overflow-hidden rounded-lg border border-border bg-background">
          <li v-for="term in recent" :key="term">
            <button type="button" class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-accent/60" @click="useRecent(term)">
              <Clock class="size-3.5 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ term }}</span>
            </button>
          </li>
        </ul>
      </div>
    </EmptyState>

    <div v-else-if="isSearching && !results" class="space-y-2">
      <Skeleton v-for="index in 5" :key="index" class="h-14 w-full rounded-xl" />
    </div>

    <template v-else-if="results">
      <p class="px-1 text-xs text-muted-foreground">
        {{ isSearching ? 'Updating…' : `${totalHits} result${totalHits === 1 ? '' : 's'}` }}
      </p>

      <EmptyState
        v-if="!totalHits"
        :icon="Search"
        title="No results"
        :description="`Nothing matches “${query}”. Try another word, a task key, or switch scope.`"
        class="rounded-xl border border-dashed border-border/80 bg-card/60 py-12"
      />

      <section v-if="results.issues.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">Tasks</h2>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="issue in results.issues" :key="issue.id">
            <RouterLink :to="{ name: 'issue', params: { issueKey: issue.key } }" :class="[rowClass, 'flex-col gap-2 sm:flex-row sm:items-center']">
              <span class="flex min-w-0 items-center gap-3">
                <IssueTypeIcon :type="issue.type" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ issue.title }}</span>
                  <span class="block text-xs text-muted-foreground">
                    {{ issue.key }} · {{ issue.project.name }}
                    <template v-if="matchFieldLabel(issue.matchedOn)"> · matched in {{ matchFieldLabel(issue.matchedOn) }}</template>
                  </span>
                </span>
              </span>
              <StatusBadge :status="issue.status" class="shrink-0 self-start sm:self-center" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.projects.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">Projects</h2>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="project in results.projects" :key="project.id">
            <RouterLink :to="{ name: 'project-board', params: { projectId: project.id } }" :class="rowClass">
              <span class="size-3 shrink-0 rounded-sm" :style="{ backgroundColor: project.color }" />
              <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ project.name }}</span>
              <span class="shrink-0 text-xs text-muted-foreground">{{ project.key }}</span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.people.length" class="space-y-2">
        <h2 class="px-1 text-xs font-medium text-muted-foreground">People</h2>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="person in results.people" :key="person.id">
            <RouterLink :to="{ name: 'issues', query: { assigneeId: person.id } }" :class="rowClass">
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
