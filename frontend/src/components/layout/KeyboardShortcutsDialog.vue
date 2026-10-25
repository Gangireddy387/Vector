<script setup lang="ts">
import { Command, FolderKanban, Keyboard, ListChecks, Navigation, Search, SearchX } from 'lucide-vue-next'
import { type Component, computed, ref, watch } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const open = defineModel<boolean>('open', { default: false })

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'

interface Shortcut {
  label: string
  /** Keys pressed together, e.g. Ctrl + K. */
  combo?: string[]
  /** Keys pressed one after another, e.g. G then H. */
  sequence?: string[]
  /** An alternative key for the same action. */
  or?: string
}

interface Group {
  title: string
  icon: Component
  shortcuts: Shortcut[]
}

const GROUPS: Group[] = [
  {
    title: 'General',
    icon: Command,
    shortcuts: [
      { label: 'Search and commands', combo: [MOD, 'K'], or: '/' },
      { label: 'Create issue', combo: ['C'] },
      { label: 'Show keyboard shortcuts', combo: ['?'] },
      { label: 'Submit a form', combo: [MOD, 'Enter'] },
      { label: 'Close a dialog or menu', combo: ['Esc'] },
    ],
  },
  {
    title: 'Go to',
    icon: Navigation,
    shortcuts: [
      { label: 'Home', sequence: ['G', 'H'] },
      { label: 'Inbox', sequence: ['G', 'I'] },
      { label: 'Projects', sequence: ['G', 'P'] },
      { label: 'All issues', sequence: ['G', 'A'] },
      { label: 'Reports', sequence: ['G', 'R'] },
    ],
  },
  {
    title: 'Inside a project',
    icon: FolderKanban,
    shortcuts: [
      { label: 'Board', sequence: ['G', 'B'] },
      { label: 'Backlog', sequence: ['G', 'L'] },
      { label: 'Progress', sequence: ['G', 'O'] },
    ],
  },
  {
    title: 'Lists, menus and search',
    icon: ListChecks,
    shortcuts: [
      { label: 'Move up and down', combo: ['↑', '↓'] },
      { label: 'Open or choose', combo: ['Enter'] },
      { label: 'Jump to first / last', combo: ['Home', 'End'] },
    ],
  },
]

const query = ref('')
watch(open, (isOpen) => isOpen && (query.value = ''))

const keysOf = (shortcut: Shortcut) => [...(shortcut.combo ?? []), ...(shortcut.sequence ?? []), shortcut.or ?? ''].join(' ').toLowerCase()
const visibleGroups = computed(() => {
  const term = query.value.trim().toLowerCase()
  if (!term) return GROUPS
  return GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.filter((shortcut) => `${group.title} ${shortcut.label} ${keysOf(shortcut)}`.toLowerCase().includes(term)),
  })).filter((group) => group.shortcuts.length)
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-0 overflow-hidden p-0 sm:max-w-2xl">
      <!-- Header -->
      <div class="space-y-4 border-b bg-muted/30 px-6 pt-6 pb-4">
        <div class="flex items-center gap-3 pr-8">
          <span class="flex size-10 shrink-0 items-center justify-center bg-brand text-primary-foreground shadow-glow">
            <Keyboard class="size-5" />
          </span>
          <div>
            <DialogTitle class="text-lg font-semibold">Keyboard shortcuts</DialogTitle>
            <DialogDescription class="text-sm text-muted-foreground">Move faster without leaving the keyboard.</DialogDescription>
          </div>
        </div>
        <label class="flex h-10 items-center gap-2 border border-input bg-card px-3 shadow-xs focus-within:border-primary focus-within:ring-4 focus-within:ring-ring/15">
          <Search class="size-4 text-muted-foreground" />
          <input v-model="query" class="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" placeholder="Search shortcuts…" aria-label="Search shortcuts" />
          <kbd v-if="query" class="text-[11px] text-muted-foreground">Esc to close</kbd>
        </label>
      </div>

      <!-- Shortcuts -->
      <div class="max-h-[min(60vh,32rem)] overflow-y-auto px-6 py-5 scrollbar-thin">
        <div v-if="visibleGroups.length" class="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <section v-for="group in visibleGroups" :key="group.title" class="space-y-2">
            <h3 class="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              <component :is="group.icon" class="size-3.5 text-primary" /> {{ group.title }}
            </h3>
            <ul class="divide-y divide-border/60 border border-border/60 bg-card">
              <li v-for="shortcut in group.shortcuts" :key="shortcut.label" class="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-accent/40">
                <span class="min-w-0">{{ shortcut.label }}</span>
                <span class="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <template v-if="shortcut.combo">
                    <kbd v-for="key in shortcut.combo" :key="key" class="keycap">{{ key }}</kbd>
                  </template>
                  <template v-for="(key, index) in shortcut.sequence ?? []" :key="`${key}-${index}`">
                    <span v-if="index" class="px-0.5">then</span>
                    <kbd class="keycap">{{ key }}</kbd>
                  </template>
                  <template v-if="shortcut.or">
                    <span class="px-0.5">or</span>
                    <kbd class="keycap">{{ shortcut.or }}</kbd>
                  </template>
                </span>
              </li>
            </ul>
          </section>
        </div>
        <div v-else class="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <SearchX class="size-6" />
          No shortcut matches “{{ query }}”.
        </div>
      </div>

      <!-- Footer -->
      <footer class="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-6 py-3 text-xs text-muted-foreground">
        <span class="flex items-center gap-1.5">Press <kbd class="keycap">?</kbd> anywhere to open this list.</span>
        <span>Single-key shortcuts pause while you type in a field.</span>
      </footer>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.keycap {
  display: inline-flex;
  min-width: 1.6rem;
  height: 1.6rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.4rem;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  background: var(--card);
  color: var(--foreground);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  box-shadow: 0 1px 0 color-mix(in oklch, var(--foreground) 6%, transparent);
}
</style>
