<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import IssueDetailView from './detail/IssueDetailView.vue'

/**
 * Wide / laptop+ issue preview driven by the `?issue=KEY` query parameter,
 * so boards and lists keep their context and the URL stays shareable.
 * Mounted only when `useDevice().isWide` (≥1024px); narrower viewports use the full issue page.
 */
const route = useRoute()
const router = useRouter()

const issueKey = computed(() => (typeof route.query.issue === 'string' ? route.query.issue : null))
const isOpen = computed({
  get: () => Boolean(issueKey.value),
  set: (open) => {
    if (!open) void router.replace({ query: { ...route.query, issue: undefined } })
  },
})

/**
 * Keyboard and screen-reader users land in the panel (not on its first field, which would open an editor), so Tab
 * and Escape work inside it right away.
 */
function focusPanel(event: Event) {
  event.preventDefault()
  ;(event.currentTarget as HTMLElement | null)?.focus?.()
}
</script>

<template>
  <Sheet v-model:open="isOpen">
    <SheetContent
      side="right"
      class="issue-detail-sheet w-full gap-0 overflow-hidden border-l border-border/80 p-0 shadow-[0_0_0_1px_color-mix(in_oklch,var(--border)_70%,transparent),_-24px_0_64px_-28px_oklch(0_0_0/0.28)] outline-none sm:max-w-[min(100vw-1.5rem,72rem)] dark:shadow-[0_0_0_1px_color-mix(in_oklch,var(--border)_80%,transparent),_-28px_0_72px_-24px_oklch(0_0_0/0.55)]"
      tabindex="-1"
      hide-close
      clear-backdrop
      @open-auto-focus="focusPanel"
    >
      <SheetTitle class="sr-only">Task {{ issueKey }}</SheetTitle>
      <SheetDescription class="sr-only">Task details</SheetDescription>
      <IssueDetailView v-if="issueKey" :issue-key="issueKey" mode="panel" @close="isOpen = false" />
    </SheetContent>
  </Sheet>
</template>
