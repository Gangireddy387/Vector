<script setup lang="ts">
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import { formatDate, getDueState } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Issue, Sprint } from '@/types/models'
import type { DependencyEdge } from '@/modules/dependencies/dependencies.api'
import {
  buildDependencyLines,
  cycleEdgeKeys,
  type DependencyBarBox,
} from '../lib/roadmap-dependency-lines'
import {
  computeRange,
  dayDeltaFromPixels,
  dayOffset,
  flattenRows,
  monthBands,
  placementDates,
  rangeDays,
  resizeIssueDates,
  shiftIssueDates,
  sprintBands,
  ticksForScale,
  todayLineLeft,
  weekendOffsets,
  type ResizeEdge,
  type RoadmapRow,
  type RoadmapScale,
} from '../lib/roadmap-timeline'

type DragMode = 'move' | 'resize-start' | 'resize-end' | 'paint'

const props = withDefaults(
  defineProps<{
    rows: RoadmapRow[]
    sprints?: Sprint[]
    scale?: RoadmapScale
    expanded: Set<string>
    dayWidth?: number
    labelWidth?: number
    compact?: boolean
    canEdit?: boolean
    /** Block edges (`from` blocks `to`). Empty = hide lines. */
    dependencyEdges?: DependencyEdge[]
    criticalIssueIds?: string[]
    dependencyCycles?: string[][]
  }>(),
  {
    sprints: () => [],
    scale: 'week',
    dayWidth: 28,
    labelWidth: 280,
    compact: false,
    canEdit: false,
    dependencyEdges: () => [],
    criticalIssueIds: () => [],
    dependencyCycles: () => [],
  },
)

const emit = defineEmits<{
  toggle: [issueId: string]
  open: [issue: Issue]
  reschedule: [issue: Issue, changes: { startDate?: string; dueDate?: string }]
}>()

const hoverLineId = ref<string | null>(null)
const hoverIssueIds = ref<Set<string>>(new Set())

const rowHeight = computed(() => (props.compact ? 38 : 44))
const flat = computed(() => flattenRows(props.rows, props.expanded))
const range = computed(() => computeRange(props.rows, props.sprints))
const totalDays = computed(() => rangeDays(range.value.start, range.value.end))
const chartWidth = computed(() => totalDays.value * props.dayWidth)
const ticks = computed(() => ticksForScale(range.value.start, range.value.end, props.scale))
const months = computed(() => monthBands(range.value.start, range.value.end))
const weekends = computed(() => weekendOffsets(range.value.start, totalDays.value))
const bands = computed(() => sprintBands(props.sprints, range.value.start, totalDays.value, props.dayWidth))
const todayLeft = computed(() => todayLineLeft(range.value.start, totalDays.value, props.dayWidth))
const criticalSet = computed(() => new Set(props.criticalIssueIds))
const showMonthHeader = computed(() => props.scale === 'week' && months.value.length > 0)

const drag = ref<{
  issueId: string
  mode: DragMode
  startX: number
  deltaX: number
  moved: boolean
  pointerId: number
  paintOriginDay?: number
} | null>(null)

function barGeometry(row: RoadmapRow) {
  if (!row.bar) return null
  const start = dayOffset(range.value.start, row.bar.start)
  const end = dayOffset(range.value.start, row.bar.end) + 1
  let left = Math.max(0, start) * props.dayWidth
  let width = Math.max(row.bar.point ? Math.max(props.dayWidth, 12) : (end - start) * props.dayWidth, 10)

  const state = drag.value
  if (state?.issueId === row.issue.id && state.moved) {
    const dayDelta = dayDeltaFromPixels(state.deltaX, props.dayWidth)
    const px = dayDelta * props.dayWidth
    if (state.mode === 'move') {
      left += px
    } else if (state.mode === 'resize-end') {
      width = Math.max(props.dayWidth, width + px)
    } else if (state.mode === 'resize-start') {
      const nextWidth = Math.max(props.dayWidth, width - px)
      left += width - nextWidth
      width = nextWidth
    }
  }

  return { left, width }
}

const dependencyLines = computed(() => {
  if (props.compact || !props.dependencyEdges.length || drag.value?.moved) return []
  const bars = new Map<string, DependencyBarBox>()
  const issueKeys = new Map<string, string>()
  flat.value.forEach((row, rowIndex) => {
    issueKeys.set(row.issue.id, row.issue.key)
    const geometry = barGeometry(row)
    if (!geometry) return
    bars.set(row.issue.id, { left: geometry.left, width: geometry.width, rowIndex })
  })
  return buildDependencyLines({
    edges: props.dependencyEdges,
    bars,
    rowHeight: rowHeight.value,
    criticalIds: props.criticalIssueIds,
    cycleKeys: cycleEdgeKeys(props.dependencyCycles),
    issueKeys,
  })
})

function setLineHover(lineId: string | null, from?: string, to?: string) {
  hoverLineId.value = lineId
  hoverIssueIds.value = lineId && from && to ? new Set([from, to]) : new Set()
}

function lineEmphasis(lineId: string, from: string, to: string) {
  if (!hoverLineId.value && !hoverIssueIds.value.size) return 'full'
  if (hoverLineId.value === lineId) return 'full'
  if (hoverIssueIds.value.has(from) || hoverIssueIds.value.has(to)) return 'full'
  return 'dim'
}

function barLinked(issueId: string) {
  return hoverIssueIds.value.has(issueId)
}

function openBlockedIssue(toId: string) {
  const row = flat.value.find((item) => item.issue.id === toId)
  if (row) emit('open', row.issue)
}

function barStyle(row: RoadmapRow) {
  const geometry = barGeometry(row)
  if (!geometry) return null
  return { left: `${geometry.left}px`, width: `${geometry.width}px` }
}

function paintGhostStyle() {
  const state = drag.value
  if (!state || state.mode !== 'paint' || state.paintOriginDay == null) return null
  const dayDelta = dayDeltaFromPixels(state.deltaX, props.dayWidth)
  const startDay = Math.min(state.paintOriginDay, state.paintOriginDay + dayDelta)
  const endDay = Math.max(state.paintOriginDay, state.paintOriginDay + dayDelta)
  const left = startDay * props.dayWidth
  const width = Math.max((endDay - startDay + 1) * props.dayWidth, props.dayWidth)
  return { left: `${left}px`, width: `${width}px` }
}

function barColor(issue: Issue) {
  return issue.status?.color || (issue.type === 'epic' ? '#8b5cf6' : '#3b82f6')
}

function barProgress(issue: Issue) {
  const total = issue.subtaskProgress?.total ?? 0
  if (!total) return null
  return Math.round((issue.subtaskProgress.done / total) * 100)
}

function isOverdue(issue: Issue) {
  return getDueState(issue.dueDate, issue.status?.category === 'done') === 'overdue'
}

function isCritical(issueId: string) {
  return criticalSet.value.has(issueId)
}

function dateHint(row: RoadmapRow) {
  if (!row.bar) return 'No dates'
  if (row.bar.point) return formatDate(row.bar.start, 'd MMM')
  return `${formatDate(row.bar.start, 'd MMM')} – ${formatDate(row.bar.end, 'd MMM')}`
}

function canInteract(row: RoadmapRow) {
  return props.canEdit && Boolean(row.bar && !row.bar.derived)
}

function canPaint(row: RoadmapRow) {
  return props.canEdit && !row.bar
}

function beginDrag(event: PointerEvent, row: RoadmapRow, mode: DragMode, paintOriginDay?: number) {
  if (event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  drag.value = {
    issueId: row.issue.id,
    mode,
    startX: event.clientX,
    deltaX: 0,
    moved: false,
    pointerId: event.pointerId,
    paintOriginDay,
  }
}

function onBarPointerDown(event: PointerEvent, row: RoadmapRow) {
  if (!canInteract(row)) return
  beginDrag(event, row, 'move')
}

function onResizePointerDown(event: PointerEvent, row: RoadmapRow, edge: ResizeEdge) {
  if (!canInteract(row)) return
  event.stopPropagation()
  beginDrag(event, row, edge === 'start' ? 'resize-start' : 'resize-end')
}

function onPaintPointerDown(event: PointerEvent, row: RoadmapRow) {
  if (!canPaint(row) || event.button !== 0) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const dayIndex = Math.max(0, Math.min(totalDays.value - 1, Math.floor((event.clientX - rect.left) / props.dayWidth)))
  beginDrag(event, row, 'paint', dayIndex)
}

function onPointerMove(event: PointerEvent, row: RoadmapRow) {
  if (!drag.value || drag.value.issueId !== row.issue.id) return
  const deltaX = event.clientX - drag.value.startX
  drag.value = {
    ...drag.value,
    deltaX,
    moved: drag.value.moved || Math.abs(deltaX) >= 4,
  }
}

function finishInteraction(event: PointerEvent, row: RoadmapRow) {
  const state = drag.value
  if (!state || state.issueId !== row.issue.id) return
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture?.(state.pointerId)) {
    target.releasePointerCapture(state.pointerId)
  }
  drag.value = null

  if (state.mode === 'paint') {
    if (state.paintOriginDay == null) return
    const dayDelta = state.moved ? dayDeltaFromPixels(state.deltaX, props.dayWidth) : 0
    const durationDays = Math.abs(dayDelta) + 1
    const startDay = Math.min(state.paintOriginDay, state.paintOriginDay + dayDelta)
    emit('reschedule', row.issue, placementDates(range.value.start, startDay, durationDays))
    return
  }

  if (!state.moved) {
    emit('open', row.issue)
    return
  }

  const dayDelta = dayDeltaFromPixels(state.deltaX, props.dayWidth)
  const changes =
    state.mode === 'move'
      ? shiftIssueDates(row.issue, dayDelta)
      : resizeIssueDates(row.issue, state.mode === 'resize-start' ? 'start' : 'end', dayDelta)
  if (changes) emit('reschedule', row.issue, changes)
}

function onBarLostCapture() {
  drag.value = null
}

onBeforeUnmount(() => {
  drag.value = null
})
</script>

<template>
  <!-- Phone: stacked cards (full width, no sideways Gantt squeeze) -->
  <div v-if="compact" class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain stagger-in">
    <article
      v-for="row in flat"
      :key="row.issue.id"
      class="relative overflow-hidden rounded-xl border border-border/80 bg-card p-3 shadow-soft"
      :class="isOverdue(row.issue) && 'border-destructive/40'"
      :style="{ marginLeft: `${row.depth * 12}px` }"
    >
      <span
        class="absolute inset-y-2 left-0 w-[3px] rounded-full"
        :style="{ backgroundColor: barColor(row.issue) }"
        aria-hidden="true"
      />
      <div class="flex items-start gap-2 pl-1.5">
        <button
          v-if="row.children.length"
          type="button"
          class="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground"
          :aria-label="expanded.has(row.issue.id) ? 'Collapse' : 'Expand'"
          @click="emit('toggle', row.issue.id)"
        >
          <ChevronDown v-if="expanded.has(row.issue.id)" class="size-4" />
          <ChevronRight v-else class="size-4" />
        </button>
        <button type="button" class="min-w-0 flex-1 text-left" @click="emit('open', row.issue)">
          <div class="flex items-center gap-1.5">
            <IssueTypeIcon :type="row.issue.type" class="size-3.5 shrink-0" />
            <span class="font-mono text-[11px] text-muted-foreground">{{ row.issue.key }}</span>
            <PriorityIcon :priority="row.issue.priority" class="ml-auto size-3.5 shrink-0" />
          </div>
          <p class="mt-1 text-sm font-medium leading-snug">{{ row.issue.title }}</p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            {{ dateHint(row) }}
            <span v-if="row.bar?.derived"> · from children</span>
            <span v-if="isOverdue(row.issue)" class="ml-1 font-medium text-destructive">· Overdue</span>
            <span v-else-if="row.issue.status" class="ml-1">· {{ row.issue.status.name }}</span>
          </p>
        </button>
      </div>
      <div v-if="row.bar" class="relative mt-3 h-2.5 overflow-hidden rounded-full bg-muted/80">
        <div
          class="absolute inset-y-0 rounded-full shadow-sm"
          :class="row.bar.derived ? 'opacity-70 ring-1 ring-dashed ring-white/50' : ''"
          :style="{
            width: row.bar.point ? '14px' : '100%',
            background: `linear-gradient(180deg, color-mix(in srgb, ${barColor(row.issue)} 88%, white), ${barColor(row.issue)})`,
            left: row.bar.point ? 'calc(50% - 7px)' : undefined,
          }"
        />
        <div
          v-if="barProgress(row.issue) != null && !row.bar.point"
          class="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-white/35"
          :style="{ width: `${barProgress(row.issue)}%` }"
        />
      </div>
    </article>
    <p v-if="!flat.length" class="px-2 py-10 text-center text-sm text-muted-foreground">No work items match this view.</p>
  </div>

  <!-- Tablet / desktop: scrollable Gantt -->
  <div v-else class="roadmap-gantt flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-soft">
    <div class="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain touch-pan-x touch-pan-y">
      <div class="sticky top-0 z-20 flex border-b border-border/70 bg-card/95 backdrop-blur-md">
        <div
          class="sticky left-0 z-30 flex shrink-0 items-end border-r border-border/70 bg-card px-2 pb-2.5 text-[11px] font-medium text-muted-foreground sm:px-3 sm:text-xs"
          :class="showMonthHeader ? 'pt-7' : 'items-center pt-0'"
          :style="{ width: `${labelWidth}px`, minHeight: showMonthHeader ? '52px' : '40px' }"
        >
          Work item
        </div>
        <div class="relative" :style="{ width: `${chartWidth}px`, minWidth: `${chartWidth}px` }">
          <!-- Dual header: months above weeks for clearer Gantt scanning -->
          <div v-if="showMonthHeader" class="flex h-6 border-b border-border/50">
            <div
              v-for="(month, index) in months"
              :key="`${month.label}-${index}`"
              class="flex items-center border-r border-border/40 px-1.5 text-[10px] font-semibold tracking-wide text-foreground/80 sm:px-2 sm:text-[11px]"
              :style="{ width: `${month.span * dayWidth}px` }"
            >
              <span class="truncate">{{ month.label }}</span>
            </div>
          </div>
          <div class="flex h-8 sm:h-9">
            <div
              v-for="(tick, index) in ticks"
              :key="`${tick.label}-${index}`"
              class="flex items-center border-r border-border/50 px-1.5 text-[10px] font-medium text-muted-foreground sm:px-2 sm:text-[11px]"
              :style="{ width: `${tick.span * dayWidth}px` }"
            >
              <span class="truncate">{{ tick.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!flat.length" class="px-4 py-12 text-center text-sm text-muted-foreground">
        No work items match this view.
      </div>

      <div v-else class="relative" :style="{ width: `${labelWidth + chartWidth}px` }">
        <!-- Weekend columns -->
        <div
          v-for="offset in weekends"
          :key="`weekend-${offset}`"
          class="pointer-events-none absolute top-0 bottom-0 bg-muted/35"
          :style="{ left: `${labelWidth + offset * dayWidth}px`, width: `${dayWidth}px` }"
        />

        <div
          v-for="band in bands"
          :key="band.sprint.id"
          class="pointer-events-none absolute top-0 bottom-0 border-x border-primary/10 bg-primary/[0.045]"
          :style="{ left: `${labelWidth + band.left}px`, width: `${band.width}px` }"
        >
          <span
            class="sticky top-12 ml-1.5 inline-block max-w-[8rem] truncate rounded-md bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/15"
          >
            {{ band.sprint.name }}
          </span>
        </div>

        <div
          v-if="todayLeft !== null"
          class="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-destructive"
          :style="{ left: `${labelWidth + todayLeft}px`, boxShadow: '0 0 0 1px color-mix(in oklch, var(--destructive) 25%, transparent)' }"
        >
          <span
            class="absolute -left-0.5 top-0 -translate-x-1/2 rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive-foreground shadow-sm"
          >
            Today
          </span>
        </div>

        <svg
          v-if="dependencyLines.length"
          class="pointer-events-none absolute top-0 z-[1]"
          :width="chartWidth"
          :height="flat.length * rowHeight"
          :style="{ left: `${labelWidth}px`, width: `${chartWidth}px`, height: `${flat.length * rowHeight}px` }"
          aria-hidden="true"
        >
          <defs>
            <marker id="roadmap-dep-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="fill-muted-foreground/55" />
            </marker>
            <marker id="roadmap-dep-arrow-critical" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="fill-primary" />
            </marker>
            <marker id="roadmap-dep-arrow-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" class="fill-destructive/80" />
            </marker>
          </defs>
          <path
            v-for="line in dependencyLines"
            :key="line.id"
            :d="line.d"
            fill="none"
            class="cursor-pointer transition-opacity"
            :class="[
              line.cycle ? 'stroke-destructive/70' : line.critical ? 'stroke-primary' : 'stroke-muted-foreground/45',
              lineEmphasis(line.id, line.from, line.to) === 'dim' ? 'opacity-20' : 'opacity-100',
            ]"
            :stroke-width="line.critical || line.cycle ? 2 : 1.35"
            :stroke-dasharray="line.cycle ? '5 4' : undefined"
            :marker-end="
              line.cycle
                ? 'url(#roadmap-dep-arrow-cycle)'
                : line.critical
                  ? 'url(#roadmap-dep-arrow-critical)'
                  : 'url(#roadmap-dep-arrow)'
            "
            style="pointer-events: stroke"
            @pointerenter="setLineHover(line.id, line.from, line.to)"
            @pointerleave="setLineHover(null)"
            @click.stop="openBlockedIssue(line.to)"
          >
            <title>{{ line.fromKey }} blocks {{ line.toKey }}</title>
          </path>
        </svg>

        <div
          v-for="(row, rowIndex) in flat"
          :key="row.issue.id"
          class="group flex border-b border-border/40 transition-colors hover:bg-muted/25"
          :class="rowIndex % 2 === 1 && 'bg-muted/[0.12]'"
          :style="{ height: `${rowHeight}px` }"
        >
          <div
            class="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r border-border/60 bg-card/95 px-1.5 backdrop-blur-[2px] group-hover:bg-muted/25 sm:gap-1.5 sm:px-2"
            :class="rowIndex % 2 === 1 && 'bg-muted/[0.12]'"
            :style="{ width: `${labelWidth}px`, paddingLeft: `${6 + row.depth * 14}px` }"
          >
            <button
              v-if="row.children.length"
              type="button"
              class="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground sm:size-5"
              :aria-label="expanded.has(row.issue.id) ? 'Collapse' : 'Expand'"
              @click="emit('toggle', row.issue.id)"
            >
              <ChevronDown v-if="expanded.has(row.issue.id)" class="size-3.5" />
              <ChevronRight v-else class="size-3.5" />
            </button>
            <span v-else class="size-5 shrink-0 sm:size-5" />
            <IssueTypeIcon :type="row.issue.type" class="size-3.5 shrink-0" />
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-xs hover:underline sm:text-sm"
              @click="emit('open', row.issue)"
            >
              <span class="mr-1 font-mono text-[10px] text-muted-foreground sm:mr-1.5 sm:text-[11px]">{{ row.issue.key }}</span>
              {{ row.issue.title }}
            </button>
            <span
              v-if="isOverdue(row.issue)"
              class="hidden shrink-0 rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive lg:inline"
            >
              Late
            </span>
            <PriorityIcon :priority="row.issue.priority" class="hidden size-3.5 shrink-0 lg:block" />
          </div>

          <div
            class="relative"
            :class="canPaint(row) ? 'cursor-crosshair touch-none' : ''"
            :style="{ width: `${chartWidth}px`, minWidth: `${chartWidth}px` }"
            @pointerdown="canPaint(row) && onPaintPointerDown($event, row)"
            @pointermove="drag?.mode === 'paint' && drag.issueId === row.issue.id && onPointerMove($event, row)"
            @pointerup="drag?.mode === 'paint' && drag.issueId === row.issue.id && finishInteraction($event, row)"
            @pointercancel="drag?.mode === 'paint' && drag.issueId === row.issue.id && finishInteraction($event, row)"
            @lostpointercapture="onBarLostCapture"
          >
            <div
              class="pointer-events-none absolute inset-0 opacity-80"
              :style="{
                backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${dayWidth - 1}px, color-mix(in oklch, var(--border) 55%, transparent) ${dayWidth - 1}px, color-mix(in oklch, var(--border) 55%, transparent) ${dayWidth}px)`,
              }"
            />
            <div
              v-if="drag?.issueId === row.issue.id && drag.mode === 'paint' && paintGhostStyle()"
              class="pointer-events-none absolute top-1/2 z-[1] h-6 -translate-y-1/2 rounded-md bg-primary/35 ring-1 ring-primary/55 shadow-sm"
              :style="paintGhostStyle()!"
            />
            <button
              v-if="barStyle(row)"
              type="button"
              :class="
                cn(
                  'roadmap-bar absolute top-1/2 z-[2] flex h-[22px] -translate-y-1/2 items-center overflow-hidden px-1.5 text-left text-[10px] font-medium text-white sm:h-6 sm:px-2 sm:text-[11px]',
                  row.bar?.point ? 'rounded-full' : 'rounded-[7px]',
                  row.bar?.derived && 'opacity-75 ring-1 ring-dashed ring-white/45',
                  canInteract(row) && 'cursor-grab touch-none active:cursor-grabbing',
                  drag?.issueId === row.issue.id && drag.moved && 'z-[3] cursor-grabbing roadmap-bar--dragging',
                  barLinked(row.issue.id) && 'brightness-110 ring-2 ring-primary/75 ring-offset-1 ring-offset-background',
                  isCritical(row.issue.id) && !row.bar?.derived && 'ring-1 ring-primary/55',
                  isOverdue(row.issue) && 'ring-1 ring-destructive/60',
                )
              "
              :style="{
                ...barStyle(row)!,
                background: `linear-gradient(180deg, color-mix(in srgb, ${barColor(row.issue)} 82%, white), ${barColor(row.issue)})`,
                boxShadow: `0 1px 2px color-mix(in srgb, ${barColor(row.issue)} 35%, transparent)`,
              }"
              :title="
                canInteract(row)
                  ? `${row.issue.key}: ${dateHint(row)} · drag to move · edges to resize · click to open`
                  : `${row.issue.key}: ${dateHint(row)}${row.bar?.derived ? ' (from children)' : ''}`
              "
              @pointerenter="hoverIssueIds = new Set([row.issue.id])"
              @pointerleave="!hoverLineId && (hoverIssueIds = new Set())"
              @pointerdown.stop="canInteract(row) && onBarPointerDown($event, row)"
              @pointermove="canInteract(row) && drag?.mode !== 'paint' && onPointerMove($event, row)"
              @pointerup="canInteract(row) && drag?.mode !== 'paint' && finishInteraction($event, row)"
              @pointercancel="canInteract(row) && drag?.mode !== 'paint' && finishInteraction($event, row)"
              @lostpointercapture="onBarLostCapture"
              @click.prevent="!canInteract(row) && emit('open', row.issue)"
            >
              <span
                class="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent"
                aria-hidden="true"
              />
              <span
                v-if="barProgress(row.issue) != null && !row.bar?.point"
                class="pointer-events-none absolute inset-y-0 left-0 bg-black/15"
                :style="{ width: `${barProgress(row.issue)}%` }"
                aria-hidden="true"
              />
              <span
                v-if="canInteract(row)"
                class="absolute inset-y-0 left-0 z-[1] w-2.5 cursor-ew-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
                @pointerdown.stop="onResizePointerDown($event, row, 'start')"
                @pointermove.stop="onPointerMove($event, row)"
                @pointerup.stop="finishInteraction($event, row)"
                @pointercancel.stop="finishInteraction($event, row)"
              />
              <span class="relative truncate px-1 drop-shadow-sm">{{ row.issue.key }}</span>
              <span
                v-if="canInteract(row)"
                class="absolute inset-y-0 right-0 z-[1] w-2.5 cursor-ew-resize touch-none opacity-0 transition-opacity group-hover:opacity-100"
                @pointerdown.stop="onResizePointerDown($event, row, 'end')"
                @pointermove.stop="onPointerMove($event, row)"
                @pointerup.stop="finishInteraction($event, row)"
                @pointercancel.stop="finishInteraction($event, row)"
              />
            </button>
            <span
              v-else-if="!canPaint(row)"
              class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/55"
            >
              No dates
            </span>
            <span
              v-else
              class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-md border border-dashed border-border/70 bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100"
            >
              Drag to set dates
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden shrink-0 border-t border-border/70 bg-card/95 px-3 py-2 text-[11px] text-muted-foreground sm:flex">
      <div class="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-4 rounded-[3px] bg-gradient-to-b from-primary/80 to-primary shadow-sm" /> Dated bar
        </span>
        <span class="inline-flex items-center gap-1.5"><span class="size-2.5 rounded-full bg-primary shadow-sm" /> Single date</span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-4 rounded-[3px] bg-primary/45 ring-1 ring-dashed ring-primary/40" /> Derived
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2.5 w-2 rounded-sm bg-muted" /> Weekend
        </span>
        <span v-if="dependencyEdges.length" class="inline-flex items-center gap-1.5">
          <span class="h-px w-4 bg-muted-foreground/50" /> Blocks
        </span>
        <span v-if="criticalIssueIds.length" class="inline-flex items-center gap-1.5">
          <span class="h-px w-4 bg-primary" /> Critical path
        </span>
        <span class="text-muted-foreground/80">
          <template v-if="canEdit">Drag to move · edges to resize · empty row to paint dates</template>
          <template v-else>View only · open a work item to see details</template>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.roadmap-bar {
  transition:
    filter var(--motion-fast) ease,
    box-shadow var(--motion-base) var(--ease-out-soft),
    transform var(--motion-fast) var(--ease-out-soft);
}
.roadmap-bar:hover {
  filter: brightness(1.08);
}
.roadmap-bar--dragging {
  transform: translateY(-50%) scale(1.02);
  box-shadow:
    0 6px 16px -6px oklch(0 0 0 / 0.28),
    0 0 0 1px color-mix(in oklch, var(--primary) 28%, transparent) !important;
}
</style>
