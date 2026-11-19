<script setup lang="ts">
import { computed, nextTick, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import type { DependencyEdge, DependencyNode } from '../dependencies.api'

const props = defineProps<{
  nodes: DependencyNode[]
  edges: DependencyEdge[]
  focusId?: string | null
}>()

const root = ref<HTMLElement | null>(null)
const lines = ref<Array<{ x1: number; y1: number; x2: number; y2: number; critical: boolean }>>([])

const layers = computed(() => {
  const byLayer = new Map<number, DependencyNode[]>()
  for (const node of props.nodes) {
    const list = byLayer.get(node.layer) ?? []
    list.push(node)
    byLayer.set(node.layer, list)
  }
  return [...byLayer.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([layer, nodes]) => ({
      layer,
      nodes: nodes.sort((a, b) => Number(b.onCriticalPath) - Number(a.onCriticalPath) || a.key.localeCompare(b.key)),
    }))
})

const criticalIds = computed(() => new Set(props.nodes.filter((node) => node.onCriticalPath).map((node) => node.id)))

function updateLines() {
  const host = root.value
  if (!host) {
    lines.value = []
    return
  }
  const hostBox = host.getBoundingClientRect()
  const next: typeof lines.value = []
  for (const edge of props.edges) {
    const fromEl = host.querySelector<HTMLElement>(`[data-node="${edge.from}"]`)
    const toEl = host.querySelector<HTMLElement>(`[data-node="${edge.to}"]`)
    if (!fromEl || !toEl) continue
    const a = fromEl.getBoundingClientRect()
    const b = toEl.getBoundingClientRect()
    next.push({
      x1: a.right - hostBox.left,
      y1: a.top + a.height / 2 - hostBox.top,
      x2: b.left - hostBox.left,
      y2: b.top + b.height / 2 - hostBox.top,
      critical: criticalIds.value.has(edge.from) && criticalIds.value.has(edge.to),
    })
  }
  lines.value = next
}

let resizeObserver: ResizeObserver | null = null

watch(
  () => [props.nodes, props.edges],
  async () => {
    await nextTick()
    updateLines()
  },
  { deep: true },
)

onMounted(async () => {
  await nextTick()
  updateLines()
  resizeObserver = new ResizeObserver(() => updateLines())
  if (root.value) resizeObserver.observe(root.value)
  window.addEventListener('resize', updateLines)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('resize', updateLines)
})
</script>

<template>
  <div
    ref="root"
    class="relative overflow-x-auto rounded-xl border border-border/80 bg-card p-3 sm:p-4"
  >
    <svg class="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <marker id="dep-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-muted-foreground/50" />
        </marker>
        <marker id="dep-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-primary" />
        </marker>
      </defs>
      <path
        v-for="(line, index) in lines"
        :key="index"
        :d="`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`"
        fill="none"
        :class="line.critical ? 'stroke-primary' : 'stroke-muted-foreground/40'"
        :stroke-width="line.critical ? 2 : 1.25"
        :marker-end="line.critical ? 'url(#dep-arrow-critical)' : 'url(#dep-arrow)'"
      />
    </svg>

    <div class="relative z-10 flex min-w-max gap-8 sm:gap-12">
      <div v-for="column in layers" :key="column.layer" class="flex w-56 shrink-0 flex-col gap-2 sm:w-64">
        <p class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {{ column.layer === 0 ? 'Ready / roots' : `Layer ${column.layer}` }}
        </p>
        <RouterLink
          v-for="node in column.nodes"
          :key="node.id"
          :data-node="node.id"
          :to="{ name: 'issue', params: { issueKey: node.key } }"
          class="block rounded-lg border bg-background px-2.5 py-2 text-sm shadow-soft transition-colors hover:border-primary/40"
          :class="[
            node.onCriticalPath ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border/80',
            node.done && 'opacity-55',
            focusId === node.id && 'ring-2 ring-primary',
          ]"
        >
          <div class="flex items-center gap-1.5">
            <IssueTypeIcon :type="node.type" />
            <span class="text-xs text-muted-foreground">{{ node.key }}</span>
            <span v-if="node.onCriticalPath" class="ml-auto text-[10px] font-medium text-primary">critical</span>
          </div>
          <p class="mt-1 line-clamp-2 font-medium leading-snug">{{ node.title }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ node.statusName || node.statusCategory }}
            <template v-if="node.blockedByOpen"> · blocked by {{ node.blockedByOpen }}</template>
          </p>
        </RouterLink>
      </div>
    </div>
  </div>
</template>
