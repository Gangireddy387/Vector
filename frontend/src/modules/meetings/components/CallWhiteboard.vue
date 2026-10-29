<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { Download, Eraser, Highlighter, PenLine, Trash2, Undo2, X } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import type { WhiteboardStroke } from '../meetings.api'
import { type BoardEvent, useMeetingCall } from '../useMeetingCall'

/**
 * The call's shared whiteboard. Everyone draws on the same board and sees strokes appear as they are drawn; it is
 * kept with the meeting. With `strokes` it only shows a saved board (after the meeting).
 */
const props = withDefaults(defineProps<{ strokes?: WhiteboardStroke[] | null; closable?: boolean }>(), { strokes: null, closable: true })
const emit = defineEmits<{ close: [] }>()

const COLORS = ['#111827', '#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#9333ea']
const SIZES = [
  { value: 3, label: 'Thin' },
  { value: 6, label: 'Medium' },
  { value: 12, label: 'Thick' },
]
/** Stroke widths are in board units: 1000 across the board, whatever its size on screen. */
const BOARD_UNITS = 1000
const FLUSH_MS = 40

const call = useMeetingCall()
const confirm = useConfirm()
const readonly = props.strokes !== null
const wrap = useTemplateRef<HTMLDivElement>('wrap')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const tool = ref<'pen' | 'highlighter' | 'eraser'>('pen')
const color = ref(COLORS[0]!)
const size = ref(6)
const mine: string[] = []

const strokes = () => (props.strokes ? props.strokes : [...call.boardStrokes.values()])
const canErase = (stroke: WhiteboardStroke) => call.canManage.value || stroke.owner === call.selfUser.value?.id

let cssWidth = 0
let cssHeight = 0
let frame = 0

function fit() {
  const box = wrap.value?.getBoundingClientRect()
  const element = canvas.value
  if (!box || !element) return
  let width = box.width
  let height = (width * 9) / 16
  if (height > box.height) {
    height = box.height
    width = (height * 16) / 9
  }
  const ratio = window.devicePixelRatio || 1
  cssWidth = width
  cssHeight = height
  element.style.width = `${width}px`
  element.style.height = `${height}px`
  element.width = Math.max(1, Math.round(width * ratio))
  element.height = Math.max(1, Math.round(height * ratio))
  redraw()
}

function style(context: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const element = canvas.value!
  context.strokeStyle = stroke.color
  context.lineWidth = Math.max(1, (stroke.width * element.width) / BOARD_UNITS) * (stroke.tool === 'highlighter' ? 2.5 : 1)
  context.globalAlpha = stroke.tool === 'highlighter' ? 0.35 : 1
  context.lineCap = 'round'
  context.lineJoin = 'round'
}

function drawPath(context: CanvasRenderingContext2D, stroke: WhiteboardStroke, from = 0) {
  const element = canvas.value!
  const points = stroke.points
  const start = Math.max(0, from - (from % 2))
  if (points.length - start < 2) return
  const x = (index: number) => points[index]! * element.width
  const y = (index: number) => points[index + 1]! * element.height
  style(context, stroke)
  context.beginPath()
  context.moveTo(x(start), y(start))
  if (points.length - start === 2) context.lineTo(x(start) + 0.1, y(start))
  for (let index = start + 2; index < points.length; index += 2) context.lineTo(x(index), y(index))
  context.stroke()
  context.globalAlpha = 1
}

function redraw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const element = canvas.value
    const context = element?.getContext('2d')
    if (!element || !context) return
    context.globalAlpha = 1
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, element.width, element.height)
    for (const stroke of strokes()) drawPath(context, stroke)
  })
}

function onBoard(event: BoardEvent) {
  if (event.type !== 'stroke') return redraw()
  const context = canvas.value?.getContext('2d')
  if (!context) return
  // Only the new piece (joined to the point before it) is drawn.
  drawPath(context, event.stroke, event.stroke.points.length - event.points.length - 2)
}

let stopListening: (() => void) | null = null
onMounted(() => {
  fit()
  if (!readonly) stopListening = call.onBoard(onBoard)
})
onBeforeUnmount(() => {
  stopListening?.()
  cancelAnimationFrame(frame)
})
useResizeObserver(wrap, fit)
watch(() => props.strokes, redraw)

// --- Drawing --------------------------------------------------------------------------------------------------------

let active: { id: string; pending: number[]; timer: ReturnType<typeof setTimeout> | null; last: [number, number] } | null = null
let erasing = false

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 20)

function pointOf(event: PointerEvent): [number, number] {
  const box = canvas.value!.getBoundingClientRect()
  return [(event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height]
}

function flush() {
  if (!active) return
  if (active.timer) clearTimeout(active.timer)
  active.timer = null
  if (!active.pending.length) return
  call.drawStroke({ id: active.id, color: color.value, width: size.value, tool: tool.value === 'highlighter' ? 'highlighter' : 'pen', points: active.pending.splice(0) })
}

function eraseAt(event: PointerEvent) {
  const [x, y] = pointOf(event)
  const reach = 10
  for (const stroke of strokes()) {
    if (!canErase(stroke)) continue
    for (let index = 0; index < stroke.points.length; index += 2) {
      const dx = (stroke.points[index]! - x) * cssWidth
      const dy = (stroke.points[index + 1]! - y) * cssHeight
      if (dx * dx + dy * dy <= reach * reach) {
        call.removeStroke(stroke.id)
        break
      }
    }
  }
}

function down(event: PointerEvent) {
  if (readonly || event.button > 0) return
  canvas.value?.setPointerCapture(event.pointerId)
  if (tool.value === 'eraser') {
    erasing = true
    eraseAt(event)
    return
  }
  const point = pointOf(event)
  active = { id: newId(), pending: [...point], timer: null, last: point }
  flush()
}

function move(event: PointerEvent) {
  if (erasing) return eraseAt(event)
  if (!active) return
  for (const sample of event.getCoalescedEvents?.() ?? [event]) {
    const point = pointOf(sample)
    const dx = (point[0] - active.last[0]) * cssWidth
    const dy = (point[1] - active.last[1]) * cssHeight
    if (dx * dx + dy * dy < 4) continue
    active.pending.push(...point)
    active.last = point
  }
  if (active.pending.length >= 300) flush()
  else active.timer ??= setTimeout(flush, FLUSH_MS)
}

function up() {
  erasing = false
  if (!active) return
  flush()
  mine.push(active.id)
  active = null
}

function undo() {
  while (mine.length) {
    const id = mine.pop()!
    if (call.boardStrokes.has(id)) return call.removeStroke(id)
  }
}

async function clearAll() {
  const ok = await confirm({ title: 'Clear the whiteboard?', description: 'Everything on it is erased for everyone.', confirmLabel: 'Clear', destructive: true })
  if (ok) call.clearBoard()
}

function download() {
  const link = document.createElement('a')
  link.download = 'whiteboard.png'
  link.href = canvas.value!.toDataURL('image/png')
  link.click()
}

const toolButton = 'flex size-8 items-center justify-center rounded-md transition-colors'
</script>

<template>
  <div class="flex size-full min-h-0 flex-col gap-2">
    <div class="flex shrink-0 flex-wrap items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-slate-700 shadow">
      <template v-if="!readonly">
        <button type="button" :class="[toolButton, tool === 'pen' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100']" title="Pen" aria-label="Pen" @click="tool = 'pen'">
          <PenLine class="size-4" />
        </button>
        <button
          type="button"
          :class="[toolButton, tool === 'highlighter' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100']"
          title="Highlighter"
          aria-label="Highlighter"
          @click="tool = 'highlighter'"
        >
          <Highlighter class="size-4" />
        </button>
        <button
          type="button"
          :class="[toolButton, tool === 'eraser' ? 'bg-slate-900 text-white' : 'hover:bg-slate-100']"
          title="Eraser: touch a stroke to remove it"
          aria-label="Eraser"
          @click="tool = 'eraser'"
        >
          <Eraser class="size-4" />
        </button>
        <span class="mx-1 h-5 w-px bg-slate-200" />
        <button
          v-for="swatch in COLORS"
          :key="swatch"
          type="button"
          class="size-6 rounded-full ring-offset-2 transition-shadow"
          :class="color === swatch && tool !== 'eraser' ? 'ring-2 ring-slate-400' : ''"
          :style="{ backgroundColor: swatch }"
          :aria-label="`Colour ${swatch}`"
          @click="(color = swatch), tool === 'eraser' && (tool = 'pen')"
        />
        <span class="mx-1 h-5 w-px bg-slate-200" />
        <button
          v-for="option in SIZES"
          :key="option.value"
          type="button"
          :class="[toolButton, size === option.value ? 'bg-slate-100' : 'hover:bg-slate-100']"
          :title="option.label"
          :aria-label="`${option.label} line`"
          @click="size = option.value"
        >
          <span class="rounded-full bg-slate-800" :style="{ width: `${option.value + 2}px`, height: `${option.value + 2}px` }" />
        </button>
        <span class="mx-1 h-5 w-px bg-slate-200" />
        <button type="button" :class="[toolButton, 'hover:bg-slate-100']" title="Undo your last stroke" aria-label="Undo" @click="undo"><Undo2 class="size-4" /></button>
        <button v-if="call.canManage.value" type="button" :class="[toolButton, 'hover:bg-red-50 hover:text-red-600']" title="Clear for everyone" aria-label="Clear the board" @click="clearAll">
          <Trash2 class="size-4" />
        </button>
      </template>
      <span v-else class="px-1 text-xs font-medium text-slate-500">Whiteboard from this meeting</span>
      <button type="button" :class="[toolButton, 'ml-auto hover:bg-slate-100']" title="Download as an image" aria-label="Download" @click="download"><Download class="size-4" /></button>
      <button v-if="closable && !readonly" type="button" :class="[toolButton, 'hover:bg-slate-100']" title="Close the whiteboard for everyone" aria-label="Close whiteboard" @click="emit('close')">
        <X class="size-4" />
      </button>
    </div>
    <div ref="wrap" class="flex min-h-0 flex-1 items-center justify-center">
      <canvas
        ref="canvas"
        class="rounded-lg bg-white shadow-lg"
        :class="readonly ? '' : tool === 'eraser' ? 'cursor-cell' : 'cursor-crosshair'"
        style="touch-action: none"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @lostpointercapture="up"
      />
    </div>
  </div>
</template>
