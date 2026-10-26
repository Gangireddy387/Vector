<script setup lang="ts">
import { onClickOutside, watchDebounced } from '@vueuse/core'
import { BarChart3, FolderKanban, House, Inbox, ListTodo, Loader2, Moon, Plus, Search, Settings, Sun, User as UserIcon, X } from 'lucide-vue-next'
import { type Component, computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import StatusBadge from '@/components/common/StatusBadge.vue'
import { useTheme } from '@/composables/useTheme'
import { useAuthStore } from '@/modules/auth/auth.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { type SearchResults, searchApi } from '@/modules/search/search.api'
import { useUiStore } from '@/stores/ui.store'

interface SearchItem {
  id: string
  group: string
  label: string
  hint?: string
  icon?: Component
  color?: string
  issue?: SearchResults['issues'][number]
  run: () => void
}

const ui = useUiStore()
const router = useRouter()
const projects = useProjectsStore()
const auth = useAuthStore()
const { resolvedTheme, preference } = useTheme()

const rootRef = useTemplateRef<HTMLElement>('root')
const inputRef = useTemplateRef<HTMLInputElement>('input')
const listRef = useTemplateRef<HTMLElement>('list')

const query = ref('')
const results = ref<SearchResults | null>(null)
const isSearching = ref(false)
const activeIndex = ref(0)

function close() {
  ui.isSearchOpen = false
  query.value = ''
  results.value = null
  inputRef.value?.blur()
}

const go = (to: Parameters<typeof router.push>[0]) => () => {
  close()
  void router.push(to)
}

const actions = computed<SearchItem[]>(() => [
  { id: 'create', group: 'Actions', label: 'Create task', hint: 'C', icon: Plus, run: () => { close(); ui.openCreateIssue() } },
  { id: 'home', group: 'Navigate', label: 'Go to Home', hint: 'G H', icon: House, run: go({ name: 'home' }) },
  { id: 'issues', group: 'Navigate', label: 'Go to All tasks', hint: 'G A', icon: ListTodo, run: go({ name: 'issues' }) },
  { id: 'inbox', group: 'Navigate', label: 'Go to Inbox', hint: 'G I', icon: Inbox, run: go({ name: 'inbox' }) },
  { id: 'projects', group: 'Navigate', label: 'Go to Projects', hint: 'G P', icon: FolderKanban, run: go({ name: 'projects' }) },
  ...(auth.hasFeature('reports') ? [{ id: 'reports', group: 'Navigate', label: 'Go to Reports', icon: BarChart3, run: go({ name: 'reports' }) }] : []),
  { id: 'settings', group: 'Navigate', label: 'Open settings', icon: Settings, run: go({ name: 'settings' }) },
  {
    id: 'theme',
    group: 'Actions',
    label: resolvedTheme.value === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
    icon: resolvedTheme.value === 'dark' ? Sun : Moon,
    run: () => {
      preference.value = resolvedTheme.value === 'dark' ? 'light' : 'dark'
      close()
    },
  },
  ...projects.activeProjects.map((project) => ({
    id: `project-${project.id}`,
    group: 'Projects',
    label: project.name,
    hint: project.key,
    color: project.color,
    run: go({ name: 'project-board', params: { projectId: project.id } }),
  })),
])

const items = computed<SearchItem[]>(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return actions.value
  const matchingActions = actions.value.filter((item) => item.label.toLowerCase().includes(term) && item.group !== 'Projects')
  const found = results.value
  return [
    ...(found?.issues ?? []).map((issue) => ({
      id: `issue-${issue.id}`,
      group: 'Tasks',
      label: issue.title,
      hint: issue.key,
      issue,
      run: go({ name: 'issue', params: { issueKey: issue.key } }),
    })),
    ...(found?.projects ?? []).map((project) => ({
      id: `project-${project.id}`,
      group: 'Projects',
      label: project.name,
      hint: project.key,
      color: project.color,
      run: go({ name: 'project-board', params: { projectId: project.id } }),
    })),
    ...(found?.people ?? []).map((person) => ({
      id: `person-${person.id}`,
      group: 'People',
      label: person.name,
      hint: 'View assigned tasks',
      icon: UserIcon,
      run: go({ name: 'issues', query: { assigneeId: person.id } }),
    })),
    ...matchingActions,
  ]
})

const groups = computed(() => {
  const map = new Map<string, Array<SearchItem & { index: number }>>()
  items.value.forEach((item, index) => {
    if (!map.has(item.group)) map.set(item.group, [])
    map.get(item.group)!.push({ ...item, index })
  })
  return [...map.entries()]
})

watchDebounced(
  query,
  async (value) => {
    const term = value.trim()
    if (!term) {
      results.value = null
      return
    }
    isSearching.value = true
    try {
      results.value = await searchApi.search(term, 8)
    } finally {
      isSearching.value = false
    }
  },
  { debounce: 200 },
)

watch(items, () => (activeIndex.value = 0))
watch(
  () => ui.isSearchOpen,
  (open) => {
    if (open) void nextTick(() => inputRef.value?.focus())
  },
)

onClickOutside(rootRef, () => {
  if (ui.isSearchOpen) ui.isSearchOpen = false
})

async function scrollActiveIntoView() {
  await nextTick()
  listRef.value?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (!ui.isSearchOpen) ui.isSearchOpen = true
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % Math.max(1, items.value.length)
    void scrollActiveIntoView()
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + items.value.length) % Math.max(1, items.value.length)
    void scrollActiveIntoView()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    items.value[activeIndex.value]?.run()
  }
}

function clearQuery() {
  query.value = ''
  inputRef.value?.focus()
}
</script>

<template>
  <div ref="root" class="relative w-full max-w-md">
    <div
      class="flex h-9 items-center gap-2 border bg-card/70 px-3 text-sm shadow-xs transition-all"
      :class="ui.isSearchOpen ? 'border-primary bg-card ring-4 ring-ring/15' : 'border-border/70 hover:border-primary/30 hover:bg-card'"
    >
      <Search class="size-4 shrink-0 text-muted-foreground" />
      <input
        ref="input"
        v-model="query"
        type="text"
        class="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        placeholder="Search tasks, projects, people…"
        role="combobox"
        aria-label="Search"
        aria-controls="global-search-results"
        :aria-expanded="ui.isSearchOpen"
        autocomplete="off"
        spellcheck="false"
        @focus="ui.isSearchOpen = true"
        @click="ui.isSearchOpen = true"
        @input="ui.isSearchOpen = true"
        @keydown="onKeydown"
      />
      <Loader2 v-if="isSearching" class="size-4 shrink-0 animate-spin text-muted-foreground" />
      <button
        v-else-if="query"
        type="button"
        class="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
        aria-label="Clear search"
        @click="clearQuery"
      >
        <X class="size-3.5" />
      </button>
      <kbd v-else-if="!ui.isSearchOpen" class="shrink-0 border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Ctrl K</kbd>
    </div>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="-translate-y-1 opacity-0"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="-translate-y-1 opacity-0"
    >
      <div
        v-if="ui.isSearchOpen"
        class="absolute top-full right-0 left-0 z-50 mt-1.5 flex flex-col border border-border/80 bg-popover/95 text-popover-foreground shadow-elevated backdrop-blur-xl"
      >
        <div id="global-search-results" ref="list" class="max-h-[min(60vh,28rem)] overflow-y-auto p-1.5" role="listbox">
          <p v-if="!items.length" class="py-8 text-center text-sm text-muted-foreground">
            {{ isSearching ? 'Searching…' : 'No results. Try a task key like VEC-12.' }}
          </p>
          <section v-for="[group, groupItems] in groups" :key="group" class="mb-1.5 last:mb-0">
            <h3 class="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{{ group }}</h3>
            <button
              v-for="item in groupItems"
              :key="item.id"
              type="button"
              role="option"
              :aria-selected="item.index === activeIndex"
              :data-active="item.index === activeIndex"
              class="flex w-full items-center gap-3 border-l-2 border-transparent px-2 py-2 text-left text-sm data-[active=true]:border-primary data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
              @mouseenter="activeIndex = item.index"
              @click="item.run()"
            >
              <IssueTypeIcon v-if="item.issue" :type="item.issue.type" />
              <span v-else-if="item.color" class="size-3 shrink-0" :style="{ backgroundColor: item.color }" />
              <component :is="item.icon" v-else-if="item.icon" class="size-4 shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <StatusBadge v-if="item.issue" :status="item.issue.status" />
              <span v-if="item.hint" class="shrink-0 text-xs text-muted-foreground">{{ item.hint }}</span>
            </button>
          </section>
        </div>
        <footer class="flex items-center gap-4 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <span><kbd class="border px-1">↑</kbd> <kbd class="border px-1">↓</kbd> navigate</span>
          <span><kbd class="border px-1">Enter</kbd> open</span>
          <span><kbd class="border px-1">Esc</kbd> close</span>
        </footer>
      </div>
    </Transition>
  </div>
</template>
