<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import UserAvatar from '@/components/common/UserAvatar.vue'
import type { DependencyEdge, DependencyNode } from '../dependencies.api'

const props = withDefaults(
  defineProps<{
    nodes: DependencyNode[]
    edges: DependencyEdge[]
    focusId?: string | null
    /** Issue-id cycles from the API — edges between members get a cycle stroke. */
    cycles?: string[][]
  }>(),
  { focusId: null, cycles: () => [] },
)

interface GraphLine {
  id: string
  from: string
  to: string
  d: string
  critical: boolean
  cycle: boolean
  midX: number
  midY: number
  fromKey: string
  toKey: string
}

const root = ref<HTMLElement | null>(null)
const lines = ref<GraphLine[]>([])
const hoverNodeId = ref<string | null>(null)
const hoverEdgeId = ref<string | null>(null)

const nodeById = computed(() => new Map(props.nodes.map((node) => [node.id, node])))
const criticalIds = computed(() => new Set(props.nodes.filter((node) => node.onCriticalPath).map((node) => node.id)))

const cycleKeys = computed(() => {
  const keys = new Set<string>()
  for (const cycle of props.cycles) {
    // API paths already close the loop (…, start); only walk consecutive pairs.
    for (let i = 0; i < cycle.length - 1; i += 1) {
      const a = cycle[i]
      const b = cycle[i + 1]
      if (a && b) keys.add(`${a}->${b}`)
    }
  }
  return keys
})

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
      nodes: nodes.sort(
        (a, b) =>
          Number(b.onCriticalPath) - Number(a.onCriticalPath) ||
          Number(Boolean(b.blockedByOpen)) - Number(Boolean(a.blockedByOpen)) ||
          a.key.localeCompare(b.key),
      ),
    }))
})

const adjacency = computed(() => {
  const forward = new Map<string, Set<string>>()
  const reverse = new Map<string, Set<string>>()
  for (const edge of props.edges) {
    if (!forward.has(edge.from)) forward.set(edge.from, new Set())
    if (!reverse.has(edge.to)) reverse.set(edge.to, new Set())
    forward.get(edge.from)!.add(edge.to)
    reverse.get(edge.to)!.add(edge.from)
  }
  return { forward, reverse }
})

const relatedIds = computed(() => {
  const id = hoverNodeId.value ?? hoverEdgeId.value
  if (!id) return new Set<string>()
  if (hoverEdgeId.value) {
    const edge = props.edges.find((item) => item.id === hoverEdgeId.value)
    return edge ? new Set([edge.from, edge.to]) : new Set<string>()
  }
  const related = new Set<string>([id])
  for (const next of adjacency.value.forward.get(id) ?? []) related.add(next)
  for (const prev of adjacency.value.reverse.get(id) ?? []) related.add(prev)
  return related
})

const relatedEdgeIds = computed(() => {
  if (!relatedIds.value.size) return new Set<string>()
  const ids = new Set<string>()
  for (const edge of props.edges) {
    if (relatedIds.value.has(edge.from) && relatedIds.value.has(edge.to)) ids.add(edge.id)
  }
  return ids
})

function layerLabel(layer: number) {
  if (layer === 0) return 'Ready / roots'
  if (layer === 1) return 'Next'
  return `Waiting · L${layer}`
}

function curvePath(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, (x2 - x1) * 0.45)
  const c1x = x1 + dx
  const c2x = x2 - dx
  return `M ${x1} ${y1} C ${c1x} ${y1}, ${c2x} ${y2}, ${x2} ${y2}`
}

function updateLines() {
  const host = root.value
  if (!host) {
    lines.value = []
    return
  }
  const hostBox = host.getBoundingClientRect()
  const next: GraphLine[] = []
  for (const edge of props.edges) {
    const fromEl = host.querySelector<HTMLElement>(`[data-node="${edge.from}"]`)
    const toEl = host.querySelector<HTMLElement>(`[data-node="${edge.to}"]`)
    if (!fromEl || !toEl) continue
    const a = fromEl.getBoundingClientRect()
    const b = toEl.getBoundingClientRect()
    const x1 = a.right - hostBox.left
    const y1 = a.top + a.height / 2 - hostBox.top
    const x2 = b.left - hostBox.left
    const y2 = b.top + b.height / 2 - hostBox.top
    const from = nodeById.value.get(edge.from)
    const to = nodeById.value.get(edge.to)
    next.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      d: curvePath(x1, y1, x2, y2),
      critical: criticalIds.value.has(edge.from) && criticalIds.value.has(edge.to),
      cycle: cycleKeys.value.has(`${edge.from}->${edge.to}`),
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
      fromKey: from?.key ?? '?',
      toKey: to?.key ?? '?',
    })
  }
  lines.value = next
}

function lineEmphasis(line: GraphLine) {
  if (!hoverNodeId.value && !hoverEdgeId.value) return 'full'
  if (hoverEdgeId.value === line.id) return 'full'
  if (relatedEdgeIds.value.has(line.id)) return 'full'
  return 'dim'
}

function nodeEmphasis(nodeId: string) {
  if (!hoverNodeId.value && !hoverEdgeId.value) return 'full'
  if (relatedIds.value.has(nodeId)) return 'full'
  return 'dim'
}

function setNodeHover(id: string | null) {
  hoverNodeId.value = id
  if (id) hoverEdgeId.value = null
}

function setEdgeHover(id: string | null) {
  hoverEdgeId.value = id
  if (id) hoverNodeId.value = null
}

let resizeObserver: ResizeObserver | null = null

watch(
  () => [props.nodes, props.edges, props.cycles],
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
    class="dependency-graph relative min-h-56 overflow-x-auto rounded-xl border border-border/80 bg-card p-3 shadow-soft sm:p-4"
  >
    <div
      class="pointer-events-none absolute inset-0 opacity-90"
      style="background:
        radial-gradient(80% 60% at 0% 0%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 55%),
        radial-gradient(70% 50% at 100% 100%, color-mix(in oklch, var(--brand-to) 8%, transparent), transparent 50%)"
      aria-hidden="true"
    />

    <svg class="absolute inset-0 size-full" aria-hidden="true">
      <defs>
        <marker id="dep-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-muted-foreground/55" />
        </marker>
        <marker id="dep-arrow-critical" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-primary" />
        </marker>
        <marker id="dep-arrow-cycle" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" class="fill-destructive/80" />
        </marker>
      </defs>
      <path
        v-for="line in lines"
        :key="line.id"
        :d="line.d"
        fill="none"
        class="cursor-pointer transition-opacity duration-200"
        :class="[
          line.cycle ? 'stroke-destructive/70' : line.critical ? 'stroke-primary' : 'stroke-muted-foreground/45',
          lineEmphasis(line) === 'dim' ? 'opacity-15' : 'opacity-100',
        ]"
        :stroke-width="line.cycle || line.critical ? 2.25 : 1.5"
        :stroke-dasharray="line.cycle ? '6 4' : undefined"
        :marker-end="
          line.cycle
            ? 'url(#dep-arrow-cycle)'
            : line.critical
              ? 'url(#dep-arrow-critical)'
              : 'url(#dep-arrow)'
        "
        style="pointer-events: stroke"
        @pointerenter="setEdgeHover(line.id)"
        @pointerleave="setEdgeHover(null)"
      >
        <title>{{ line.fromKey }} blocks {{ line.toKey }}</title>
      </path>
    </svg>

    <!-- Edge hover chip -->
    <div
      v-for="line in lines"
      :key="`chip-${line.id}`"
      v-show="hoverEdgeId === line.id"
      class="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-md border border-border/80 bg-popover px-2 py-1 text-[10px] font-medium text-popover-foreground shadow-elevated"
      :style="{ left: `${line.midX}px`, top: `${line.midY}px` }"
    >
      <span class="font-mono text-muted-foreground">{{ line.fromKey }}</span>
      <span class="mx-1 text-primary">blocks</span>
      <span class="font-mono text-muted-foreground">{{ line.toKey }}</span>
    </div>

    <div class="relative z-10 flex min-w-max gap-10 sm:gap-14">
      <div v-for="column in layers" :key="column.layer" class="flex w-[15.5rem] shrink-0 flex-col gap-2.5 sm:w-64">
        <p class="sticky left-0 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {{ layerLabel(column.layer) }}
          <span class="ml-1 font-normal normal-case text-muted-foreground/70">· {{ column.nodes.length }}</span>
        </p>
        <RouterLink
          v-for="node in column.nodes"
          :key="node.id"
          :data-node="node.id"
          :to="{ name: 'issue', params: { issueKey: node.key } }"
          class="group/node relative block overflow-hidden rounded-[10px] border bg-background/95 px-2.5 py-2 text-sm shadow-soft backdrop-blur-[1px] transition-[opacity,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-elevated"
          :class="[
            node.onCriticalPath ? 'border-primary/45 ring-1 ring-primary/20' : 'border-border/80',
            node.blockedByOpen > 0 && !node.done && 'border-warning/45',
            node.done && 'opacity-55',
            focusId === node.id && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            nodeEmphasis(node.id) === 'dim' && 'opacity-30',
          ]"
          @pointerenter="setNodeHover(node.id)"
          @pointerleave="setNodeHover(null)"
        >
          <span
            class="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
            :class="
              node.onCriticalPath
                ? 'bg-primary'
                : node.blockedByOpen > 0 && !node.done
                  ? 'bg-warning'
                  : 'bg-border'
            "
            aria-hidden="true"
          />
          <div class="flex items-center gap-1.5 pl-1.5">
            <IssueTypeIcon :type="node.type" class="size-3.5 shrink-0" />
            <span class="font-mono text-[11px] text-muted-foreground">{{ node.key }}</span>
            <PriorityIcon :priority="node.priority" class="size-3 shrink-0 opacity-80" />
            <span
              v-if="node.onCriticalPath"
              class="ml-auto rounded bg-primary/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary"
            >
              Critical
            </span>
            <span
              v-else-if="node.blockedByOpen > 0 && !node.done"
              class="ml-auto rounded bg-warning/15 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning"
            >
              Blocked
            </span>
          </div>
          <p class="mt-1 line-clamp-2 pl-1.5 font-medium leading-snug" :class="node.done && 'line-through decoration-muted-foreground/50'">
            {{ node.title }}
          </p>
          <div class="mt-1.5 flex items-center gap-1.5 pl-1.5 text-[11px] text-muted-foreground">
            <span class="truncate">{{ node.statusName || node.statusCategory }}</span>
            <template v-if="node.blockedByOpen">
              <span aria-hidden="true">·</span>
              <span class="font-medium text-warning">{{ node.blockedByOpen }} blocker{{ node.blockedByOpen === 1 ? '' : 's' }}</span>
            </template>
            <UserAvatar v-if="node.assignee" :user="node.assignee" size="xs" class="ml-auto shrink-0" />
          </div>
        </RouterLink>
      </div>
    </div>

    <p v-if="!nodes.length" class="relative z-10 px-2 py-10 text-center text-sm text-muted-foreground">
      No linked work items in this view.
    </p>
  </div>
</template>
