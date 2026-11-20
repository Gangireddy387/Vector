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
import { getErrorMessage } from '@/lib/http'
import { latestRequest } from '@/lib/latest'
import { useAuthStore } from '@/modules/auth/auth.store'
import { matchFieldLabel } from '@/modules/issues/lib/saved-filter-criteria'
import { type SearchResults, type SearchScope, searchApi } from '../search.api'
import { clearRecentSearches, readRecentSearches, rememberSearch } from '../search-recent'

/** Page size for the first fetch and each “Load more”. Backend max is 50. */
const PAGE_SIZE = 25

const { isDesktop } = useDevice()
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const scopes = computed<Array<{ value: SearchScope; label: string }>>(() => [
  { value: 'all', label: 'All' },
  { value: 'issues', label: 'Tasks' },
  { value: 'projects', label: 'Projects' },
  { value: 'people', label: 'People' },
  ...((auth.hasFeature('directMessages') || auth.hasFeature('teamChat')
    ? [{ value: 'messages' as const, label: 'Messages' }]
    : [])),
  ...(auth.hasFeature('chat') ? [{ value: 'chat' as const, label: 'Work chat' }] : []),
  ...(auth.hasFeature('wiki') ? [{ value: 'wiki' as const, label: 'Wiki' }] : []),
])

const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
const scope = ref<SearchScope>(
  typeof route.query.scope === 'string' && scopes.value.some((item) => item.value === route.query.scope)
    ? (route.query.scope as SearchScope)
    : 'all',
)
const results = ref<SearchResults | null>(null)
const isSearching = ref(false)
const isLoadingMore = ref(false)
const searchError = ref<string | null>(null)
const recent = ref(readRecentSearches())

const latest = latestRequest()
const totalHits = computed(() => {
  if (!results.value) return 0
  return (
    results.value.issues.length +
    results.value.projects.length +
    results.value.people.length +
    (results.value.messages?.length ?? 0) +
    (results.value.chat?.length ?? 0) +
    (results.value.wiki?.length ?? 0)
  )
})
const canLoadMore = computed(() => {
  if (!results.value?.hasMore) return false
  if (scope.value === 'issues') return results.value.hasMore.issues
  if (scope.value === 'projects') return results.value.hasMore.projects
  if (scope.value === 'people') return results.value.hasMore.people
  if (scope.value === 'messages') return Boolean(results.value.hasMore.messages)
  if (scope.value === 'chat') return Boolean(results.value.hasMore.chat)
  if (scope.value === 'wiki') return Boolean(results.value.hasMore.wiki)
  // On “All”, only tasks paginate; other panes stay as a short preview.
  return results.value.hasMore.issues
})

function personTo(personId: string) {
  return auth.isOrganizationAdmin
    ? { name: 'member-profile' as const, params: { userId: personId } }
    : { name: 'issues' as const, query: { assigneeId: personId } }
}

function syncUrl() {
  const next = {
    ...route.query,
    q: query.value.trim() || undefined,
    scope: scope.value === 'all' ? undefined : scope.value,
  }
  void router.replace({ query: next })
}

watch([query, scope], syncUrl)

async function runSearch() {
  const term = query.value.trim()
  if (!term) {
    latest.start()
    results.value = null
    searchError.value = null
    isSearching.value = false
    return
  }
  const ticket = latest.start()
  isSearching.value = true
  searchError.value = null
  try {
    const found = await searchApi.search(term, PAGE_SIZE, scope.value, 0)
    if (!latest.isCurrent(ticket)) return
    results.value = found
    recent.value = rememberSearch(term)
  } catch (problem) {
    if (latest.isCurrent(ticket)) {
      results.value = null
      searchError.value = getErrorMessage(problem)
    }
  } finally {
    if (latest.isCurrent(ticket)) isSearching.value = false
  }
}

async function loadMore() {
  const term = query.value.trim()
  if (!term || !results.value || !canLoadMore.value || isLoadingMore.value) return
  const ticket = latest.start()
  isLoadingMore.value = true
  try {
    const offset =
      scope.value === 'projects'
        ? results.value.projects.length
        : scope.value === 'people'
          ? results.value.people.length
          : scope.value === 'messages'
            ? (results.value.messages?.length ?? 0)
            : scope.value === 'chat'
              ? (results.value.chat?.length ?? 0)
              : scope.value === 'wiki'
                ? (results.value.wiki?.length ?? 0)
                : results.value.issues.length
    const found = await searchApi.search(term, PAGE_SIZE, scope.value === 'all' ? 'issues' : scope.value, offset)
    if (!latest.isCurrent(ticket) || !results.value) return
    if (scope.value === 'projects') {
      results.value = {
        ...results.value,
        projects: [...results.value.projects, ...found.projects],
        hasMore: { ...results.value.hasMore!, projects: Boolean(found.hasMore?.projects) },
      }
    } else if (scope.value === 'people') {
      results.value = {
        ...results.value,
        people: [...results.value.people, ...found.people],
        hasMore: { ...results.value.hasMore!, people: Boolean(found.hasMore?.people) },
      }
    } else if (scope.value === 'messages') {
      results.value = {
        ...results.value,
        messages: [...(results.value.messages ?? []), ...(found.messages ?? [])],
        hasMore: { ...results.value.hasMore!, messages: Boolean(found.hasMore?.messages) },
      }
    } else if (scope.value === 'chat') {
      results.value = {
        ...results.value,
        chat: [...(results.value.chat ?? []), ...(found.chat ?? [])],
        hasMore: { ...results.value.hasMore!, chat: Boolean(found.hasMore?.chat) },
      }
    } else if (scope.value === 'wiki') {
      results.value = {
        ...results.value,
        wiki: [...(results.value.wiki ?? []), ...(found.wiki ?? [])],
        hasMore: { ...results.value.hasMore!, wiki: Boolean(found.hasMore?.wiki) },
      }
    } else {
      results.value = {
        ...results.value,
        issues: [...results.value.issues, ...found.issues],
        hasMore: {
          issues: Boolean(found.hasMore?.issues),
          projects: results.value.hasMore?.projects ?? false,
          people: results.value.hasMore?.people ?? false,
          messages: results.value.hasMore?.messages ?? false,
          chat: results.value.hasMore?.chat ?? false,
          wiki: results.value.hasMore?.wiki ?? false,
        },
      }
    }
  } catch (problem) {
    if (latest.isCurrent(ticket)) searchError.value = getErrorMessage(problem)
  } finally {
    if (latest.isCurrent(ticket)) isLoadingMore.value = false
  }
}

watchDebounced([query, scope], () => void runSearch(), { debounce: 250 })

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
    <PageHeader
      v-if="isDesktop"
      title="Search"
      description="Find tasks, projects, people, messages, work chat and wiki pages. Use operators like assignee:me or is:open."
    />

    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="query" type="search" placeholder="Search tasks, projects, people, messages" class="h-11 pl-9 text-base" autofocus aria-label="Search" />
    </div>
    <p v-if="isDesktop" class="px-1 text-xs text-muted-foreground">
      Operators:
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">assignee:me</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">assignee:email</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">is:open</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">is:done</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">is:in_progress</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">project:KEY</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">type:bug</code>
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">priority:high</code>
      — free text still matches title, key, description, comments and labels.
    </p>
    <details v-else class="px-1 text-xs text-muted-foreground">
      <summary class="cursor-pointer select-none font-medium text-foreground/80">Search operators</summary>
      <p class="mt-1.5 leading-relaxed">
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">assignee:me</code>
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">is:open</code>
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">project:KEY</code>
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">type:bug</code>
        <code class="rounded bg-muted px-1 py-0.5 font-mono text-[0.7rem]">priority:high</code>
        — also comments, labels, messages and work chat.
      </p>
    </details>

    <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Search scope">
      <Button
        v-for="item in scopes"
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
      description="Try a task key (VEC-12), operators like assignee:me is:open type:bug, or words from a description, comment, label, project, message or teammate."
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

    <div v-else-if="isSearching && !results" class="space-y-2" aria-busy="true" aria-label="Searching">
      <Skeleton v-for="index in 5" :key="index" class="h-14 w-full rounded-xl" />
    </div>

    <EmptyState
      v-else-if="searchError && !results"
      :icon="Search"
      title="Search did not load"
      :description="searchError"
      class="rounded-xl border border-dashed border-border/80 bg-card/60 py-12"
    >
      <Button variant="outline" @click="runSearch">Try again</Button>
    </EmptyState>

    <template v-else-if="results">
      <p class="px-1 text-xs text-muted-foreground">
        {{ isSearching ? 'Updating…' : `${totalHits} result${totalHits === 1 ? '' : 's'}` }}
        <template v-if="!isSearching && canLoadMore && scope !== 'all'"> · more available</template>
        <template v-else-if="!isSearching && scope === 'all'"> · open a tab for full lists</template>
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
        <div class="flex items-center justify-between gap-2 px-1">
          <h2 class="text-xs font-medium text-muted-foreground">Projects</h2>
          <button
            v-if="scope === 'all' && results.projects.length >= 5"
            type="button"
            class="text-xs font-medium text-primary hover:underline"
            @click="scope = 'projects'"
          >
            See all projects
          </button>
        </div>
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
        <div class="flex items-center justify-between gap-2 px-1">
          <h2 class="text-xs font-medium text-muted-foreground">People</h2>
          <button
            v-if="scope === 'all' && results.people.length >= 5"
            type="button"
            class="text-xs font-medium text-primary hover:underline"
            @click="scope = 'people'"
          >
            See all people
          </button>
        </div>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="person in results.people" :key="person.id">
            <RouterLink :to="personTo(person.id)" :class="rowClass">
              <UserAvatar :user="person" size="md" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ person.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">{{ person.email }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.messages?.length" class="space-y-2">
        <div class="flex items-center justify-between gap-2 px-1">
          <h2 class="text-xs font-medium text-muted-foreground">Messages</h2>
          <button
            v-if="scope === 'all' && (results.messages?.length ?? 0) >= 5"
            type="button"
            class="text-xs font-medium text-primary hover:underline"
            @click="scope = 'messages'"
          >
            See all messages
          </button>
        </div>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="message in results.messages" :key="message.id">
            <RouterLink :to="{ name: 'messages', params: { conversationId: message.conversationId } }" :class="rowClass">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ message.title }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  <template v-if="message.author">{{ message.author.name }} · </template>{{ message.snippet }}
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.chat?.length" class="space-y-2">
        <div class="flex items-center justify-between gap-2 px-1">
          <h2 class="text-xs font-medium text-muted-foreground">Work chat</h2>
          <button
            v-if="scope === 'all' && (results.chat?.length ?? 0) >= 5"
            type="button"
            class="text-xs font-medium text-primary hover:underline"
            @click="scope = 'chat'"
          >
            See all chat
          </button>
        </div>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="message in results.chat" :key="message.id">
            <RouterLink
              :to="{ name: 'project-chat', params: { projectId: message.projectId }, query: { message: message.id } }"
              :class="rowClass"
            >
              <span class="size-3 shrink-0 rounded-sm" :style="{ backgroundColor: message.project.color }" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ message.project.name }}</span>
                <span class="block truncate text-xs text-muted-foreground">
                  <template v-if="message.author">{{ message.author.name }} · </template>{{ message.snippet }}
                </span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <section v-if="results.wiki?.length" class="space-y-2">
        <div class="flex items-center justify-between gap-2 px-1">
          <h2 class="text-xs font-medium text-muted-foreground">Wiki</h2>
          <button
            v-if="scope === 'all' && (results.wiki?.length ?? 0) >= 5"
            type="button"
            class="text-xs font-medium text-primary hover:underline"
            @click="scope = 'wiki'"
          >
            See all wiki
          </button>
        </div>
        <ul class="min-w-0 divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <li v-for="page in results.wiki" :key="page.id">
            <RouterLink :to="{ name: 'wiki-page', params: { pageId: page.id } }" :class="rowClass">
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-medium">{{ page.title }}</span>
                <span v-if="page.excerpt" class="block truncate text-xs text-muted-foreground">{{ page.excerpt }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <div v-if="canLoadMore" class="flex justify-center pt-1">
        <Button variant="outline" :loading="isLoadingMore" @click="loadMore">Load more</Button>
      </div>
    </template>
  </div>
</template>
