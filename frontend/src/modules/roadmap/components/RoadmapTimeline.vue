<script setup lang="ts">
import { ChevronDown, ChevronRight } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref } from 'vue'
import IssueTypeIcon from '@/components/common/IssueTypeIcon.vue'
import PriorityIcon from '@/components/common/PriorityIcon.vue'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Issue, Sprint } from '@/types/models'
import {
  computeRange,
  dayDeltaFromPixels,
  dayOffset,
  flattenRows,
  placementDates,
  rangeDays,
  resizeIssueDates,
  shiftIssueDates,
  sprintBands,
  ticksForScale,
  todayLineLeft,
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
  }>(),
  { sprints: () => [], scale: 'week', dayWidth: 28, labelWidth: 280, compact: false, canEdit: false },
)

const emit = defineEmits<{
  toggle: [issueId: string]
  open: [issue: Issue]
  reschedule: [issue: Issue, changes: { startDate?: string; dueDate?: string }]
}>()

const rowHeight = computed(() => (props.compact ? 36 : 40))
const flat = computed(() => flattenRows(props.rows, props.expanded))
const range = computed(() => computeRange(props.rows, props.sprints))
const totalDays = computed(() => rangeDays(range.value.start, range.value.end))
const chartWidth = computed(() => totalDays.value * props.dayWidth)
const ticks = computed(() => ticksForScale(range.value.start, range.value.end, props.scale))
const bands = computed(() => sprintBands(props.sprints, range.value.start, totalDays.value, props.dayWidth))
const todayLeft = computed(() => todayLineLeft(range.value.start, totalDays.value, props.dayWidth))

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
  <div v-if="compact" class="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain">
    <article
      v-for="row in flat"
      :key="row.issue.id"
      class="rounded-xl border bg-card p-3 shadow-soft"
      :style="{ marginLeft: `${row.depth * 12}px` }"
    >
      <div class="flex items-start gap-2">
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
            <span v-if="row.issue.status" class="ml-1">· {{ row.issue.status.name }}</span>
          </p>
        </button>
      </div>
      <div v-if="row.bar" class="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full"
          :class="row.bar.derived ? 'opacity-70' : ''"
          :style="{
            width: row.bar.point ? '12px' : '100%',
            backgroundColor: barColor(row.issue),
            marginLeft: row.bar.point ? 'calc(50% - 6px)' : undefined,
          }"
        />
      </div>
    </article>
    <p v-if="!flat.length" class="px-2 py-10 text-center text-sm text-muted-foreground">No work items match this view.</p>
  </div>

  <!-- Tablet / desktop: scrollable Gantt -->
  <div v-else class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
    <div class="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain touch-pan-x touch-pan-y">
      <div class="sticky top-0 z-20 flex border-b bg-card/95 backdrop-blur">
        <div
          class="sticky left-0 z-30 flex shrink-0 items-center border-r bg-card px-2 text-[11px] font-medium text-muted-foreground sm:px-3 sm:text-xs"
          :style="{ width: `${labelWidth}px` }"
        >
          Work item
        </div>
        <div class="relative" :style="{ width: `${chartWidth}px`, minWidth: `${chartWidth}px` }">
          <div class="flex h-9 sm:h-10">
            <div
              v-for="(tick, index) in ticks"
              :key="`${tick.label}-${index}`"
              class="flex items-center border-r border-border/60 px-1.5 text-[10px] font-medium text-muted-foreground sm:px-2 sm:text-[11px]"
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
        <div
          v-for="band in bands"
          :key="band.sprint.id"
          class="pointer-events-none absolute top-0 bottom-0 bg-primary/[0.04]"
          :style="{ left: `${labelWidth + band.left}px`, width: `${band.width}px` }"
        >
          <span class="sticky top-11 ml-1 inline-block max-w-[7rem] truncate rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {{ band.sprint.name }}
          </span>
        </div>

        <div
          v-if="todayLeft !== null"
          class="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-destructive/70"
          :style="{ left: `${labelWidth + todayLeft}px` }"
        >
          <span class="absolute left-1 top-0 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-destructive-foreground">
            Today
          </span>
        </div>

        <div
          v-for="row in flat"
          :key="row.issue.id"
          class="group flex border-b border-border/50 hover:bg-muted/30"
          :style="{ height: `${rowHeight}px` }"
        >
          <div
            class="sticky left-0 z-10 flex shrink-0 items-center gap-1 border-r bg-card px-1.5 group-hover:bg-muted/30 sm:gap-1.5 sm:px-2"
            :style="{ width: `${labelWidth}px`, paddingLeft: `${6 + row.depth * 12}px` }"
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
              class="pointer-events-none absolute inset-0"
              :style="{
                backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${dayWidth - 1}px, hsl(var(--border) / 0.35) ${dayWidth - 1}px, hsl(var(--border) / 0.35) ${dayWidth}px)`,
              }"
            />
            <div
              v-if="drag?.issueId === row.issue.id && drag.mode === 'paint' && paintGhostStyle()"
              class="pointer-events-none absolute top-1/2 z-[1] h-5 -translate-y-1/2 rounded-md bg-primary/40 ring-1 ring-primary/50"
              :style="paintGhostStyle()!"
            />
            <button
              v-if="barStyle(row)"
              type="button"
              :class="
                cn(
                  'absolute top-1/2 z-[1] flex -translate-y-1/2 items-center overflow-hidden px-1.5 text-left text-[10px] font-medium text-white shadow-sm transition-[filter] hover:brightness-110 sm:px-2 sm:text-[11px]',
                  row.bar?.point ? 'rounded-full' : 'rounded-md',
                  row.bar?.derived && 'opacity-70 ring-1 ring-dashed ring-white/40',
                  canInteract(row) && 'cursor-grab touch-none active:cursor-grabbing',
                  drag?.issueId === row.issue.id && drag.moved && 'z-[2] cursor-grabbing shadow-md',
                )
              "
              :style="{ ...barStyle(row)!, backgroundColor: barColor(row.issue) }"
              :title="
                canInteract(row)
                  ? `${row.issue.key}: drag to move · edges to resize · click to open`
                  : `${row.issue.key}: ${formatDate(row.issue.startDate)} → ${formatDate(row.issue.dueDate)}${row.bar?.derived ? ' (from children)' : ''}`
              "
              @pointerdown.stop="canInteract(row) && onBarPointerDown($event, row)"
              @pointermove="canInteract(row) && drag?.mode !== 'paint' && onPointerMove($event, row)"
              @pointerup="canInteract(row) && drag?.mode !== 'paint' && finishInteraction($event, row)"
              @pointercancel="canInteract(row) && drag?.mode !== 'paint' && finishInteraction($event, row)"
              @lostpointercapture="onBarLostCapture"
              @click.prevent="!canInteract(row) && emit('open', row.issue)"
            >
              <span
                v-if="canInteract(row)"
                class="absolute inset-y-0 left-0 z-[1] w-2 cursor-ew-resize touch-none"
                @pointerdown.stop="onResizePointerDown($event, row, 'start')"
                @pointermove.stop="onPointerMove($event, row)"
                @pointerup.stop="finishInteraction($event, row)"
                @pointercancel.stop="finishInteraction($event, row)"
              />
              <span class="truncate px-1">{{ row.issue.key }}</span>
              <span
                v-if="canInteract(row)"
                class="absolute inset-y-0 right-0 z-[1] w-2 cursor-ew-resize touch-none"
                @pointerdown.stop="onResizePointerDown($event, row, 'end')"
                @pointermove.stop="onPointerMove($event, row)"
                @pointerup.stop="finishInteraction($event, row)"
                @pointercancel.stop="finishInteraction($event, row)"
              />
            </button>
            <span
              v-else-if="!canPaint(row)"
              class="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60"
            >
              No dates
            </span>
            <span
              v-else
              class="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground/60"
            >
              Drag to set dates
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="hidden shrink-0 border-t bg-card/95 px-3 py-2 text-[11px] text-muted-foreground sm:flex">
      <div class="flex flex-wrap items-center gap-3">
        <span class="inline-flex items-center gap-1.5"><span class="h-2 w-4 rounded-sm bg-primary" /> Dated bar</span>
        <span class="inline-flex items-center gap-1.5"><span class="size-2 rounded-full bg-primary" /> Single date</span>
        <span class="inline-flex items-center gap-1.5"><span class="h-2 w-4 rounded-sm bg-primary/50 ring-1 ring-dashed ring-primary/40" /> Derived</span>
        <span v-if="canEdit">Drag to move · edges to resize · empty row to paint dates</span>
        <span v-else>View only · open a work item to see details</span>
      </div>
    </div>
  </div>
</template>
