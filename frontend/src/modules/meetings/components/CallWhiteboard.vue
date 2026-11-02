<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { ArrowUpRight, Circle, Download, Eraser, Highlighter, Minus, PenLine, Redo2, Square, StickyNote, Trash2, Type, Undo2, X } from 'lucide-vue-next'
import { type Component, computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import type { WhiteboardKind, WhiteboardStroke } from '../meetings.api'
import { type BoardEvent, useMeetingCall } from '../useMeetingCall'
import { NOTE_SIZE, boardBounds, noteFill, textLines, textSize } from '../whiteboard'

/**
 * The call's shared whiteboard. Everyone draws on the same board and sees strokes appear as they are drawn; it is
 * kept with the meeting. Freehand pen and highlighter, shapes (rectangle, ellipse, line, arrow), text and sticky
 * notes; your own changes can be undone and redone. With `strokes` it only shows a saved board (after the meeting).
 */
const props = withDefaults(defineProps<{ strokes?: WhiteboardStroke[] | null; closable?: boolean }>(), { strokes: null, closable: true })
const emit = defineEmits<{ close: [] }>()

type Tool = 'pen' | 'highlighter' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'note' | 'eraser'
const COLORS = ['#111827', '#ef4444', '#f59e0b', '#16a34a', '#2563eb', '#9333ea']
const SIZES = [
  { value: 3, label: 'Thin' },
  { value: 6, label: 'Medium' },
  { value: 12, label: 'Thick' },
]
const TOOLS: Array<{ value: Tool; label: string; icon: Component }> = [
  { value: 'pen', label: 'Pen', icon: PenLine },
  { value: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { value: 'rect', label: 'Rectangle', icon: Square },
  { value: 'ellipse', label: 'Ellipse', icon: Circle },
  { value: 'line', label: 'Line', icon: Minus },
  { value: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { value: 'text', label: 'Text: click where it goes', icon: Type },
  { value: 'note', label: 'Sticky note: click where it goes', icon: StickyNote },
  { value: 'eraser', label: 'Eraser: touch something to remove it', icon: Eraser },
]
const SHAPES: Tool[] = ['rect', 'ellipse', 'line', 'arrow']
/** Stroke widths are in board units: 1000 across the board, whatever its size on screen. */
const BOARD_UNITS = 1000
const FLUSH_MS = 40
const HISTORY = 100

const call = useMeetingCall()
const confirm = useConfirm()
const readonly = props.strokes !== null
const wrap = useTemplateRef<HTMLDivElement>('wrap')
const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
const editor = useTemplateRef<HTMLTextAreaElement>('editor')
const tool = ref<Tool>('pen')
const color = ref(COLORS[0]!)
const size = ref(6)

const strokes = () => (props.strokes ? props.strokes : [...call.boardStrokes.values()])
const canErase = (stroke: WhiteboardStroke) => call.canManage.value || stroke.owner === call.selfUser.value?.id
const kindOf = (stroke: WhiteboardStroke): WhiteboardKind => stroke.kind ?? 'path'

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

// --- Drawing on the canvas -------------------------------------------------------------------------------------------

function style(context: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const element = canvas.value!
  context.strokeStyle = stroke.color
  context.fillStyle = stroke.color
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

function drawShape(context: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const element = canvas.value!
  const [x1, y1, x2, y2] = stroke.points.map((value, index) => value * (index % 2 ? element.height : element.width)) as [number, number, number, number]
  style(context, stroke)
  context.beginPath()
  const kind = kindOf(stroke)
  if (kind === 'rect') context.rect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1))
  else if (kind === 'ellipse') context.ellipse((x1 + x2) / 2, (y1 + y2) / 2, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2, 0, 0, Math.PI * 2)
  else {
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    if (kind === 'arrow') {
      const angle = Math.atan2(y2 - y1, x2 - x1)
      const head = Math.max(10, context.lineWidth * 4)
      for (const side of [-1, 1]) {
        context.moveTo(x2, y2)
        context.lineTo(x2 - head * Math.cos(angle + (side * Math.PI) / 7), y2 - head * Math.sin(angle + (side * Math.PI) / 7))
      }
    }
  }
  context.stroke()
  context.globalAlpha = 1
}

function drawText(context: CanvasRenderingContext2D, stroke: WhiteboardStroke) {
  const element = canvas.value!
  const x = stroke.points[0]! * element.width
  const y = stroke.points[1]! * element.height
  const note = kindOf(stroke) === 'note'
  const fontPx = (textSize(stroke.width, note) * element.width) / BOARD_UNITS
  context.font = `${note ? 500 : 600} ${fontPx}px ui-sans-serif, system-ui, sans-serif`
  context.textBaseline = 'top'
  context.globalAlpha = 1
  if (note) {
    const side = (NOTE_SIZE * element.width) / BOARD_UNITS
    const pad = side * 0.08
    context.shadowColor = 'rgba(15, 23, 42, 0.18)'
    context.shadowBlur = side * 0.06
    context.shadowOffsetY = side * 0.03
    context.fillStyle = noteFill(stroke.color)
    context.fillRect(x, y, side, side)
    context.shadowColor = 'transparent'
    context.fillStyle = '#1f2937'
    const lines = textLines(stroke.text ?? '', side - pad * 2, (text) => context.measureText(text).width)
    const lineHeight = fontPx * 1.25
    lines.slice(0, Math.floor((side - pad * 2) / lineHeight)).forEach((line, index) => context.fillText(line, x + pad, y + pad + index * lineHeight))
    return
  }
  context.fillStyle = stroke.color
  ;(stroke.text ?? '').split('\n').forEach((line, index) => context.fillText(line, x, y + index * fontPx * 1.25))
}

function drawItem(context: CanvasRenderingContext2D, stroke: WhiteboardStroke, from = 0) {
  const kind = kindOf(stroke)
  if (kind === 'path') drawPath(context, stroke, from)
  else if (kind === 'text' || kind === 'note') drawText(context, stroke)
  else drawShape(context, stroke)
}

/** A shape being dragged out: drawn on top until it is let go. */
const draft = ref<WhiteboardStroke | null>(null)

function redraw() {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const element = canvas.value
    const context = element?.getContext('2d')
    if (!element || !context) return
    context.globalAlpha = 1
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, element.width, element.height)
    for (const stroke of strokes()) drawItem(context, stroke)
    if (draft.value) drawItem(context, draft.value)
  })
}

function onBoard(event: BoardEvent) {
  if (event.type !== 'stroke' || draft.value || kindOf(event.stroke) !== 'path') return redraw()
  const context = canvas.value?.getContext('2d')
  if (!context) return
  // Only the new piece of a freehand stroke (joined to the point before it) is drawn.
  drawPath(context, event.stroke, event.stroke.points.length - event.points.length - 2)
}

let stopListening: (() => void) | null = null
onMounted(() => {
  fit()
  if (!readonly) {
    stopListening = call.onBoard(onBoard)
    window.addEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  stopListening?.()
  window.removeEventListener('keydown', onKey)
  cancelAnimationFrame(frame)
})
useResizeObserver(wrap, fit)
watch(() => props.strokes, redraw)

// --- Undo and redo (your own changes) --------------------------------------------------------------------------------

type Change = { type: 'add' | 'erase'; stroke: WhiteboardStroke }
const done = ref<Change[]>([])
const undone = ref<Change[]>([])
const remember = (change: Change) => {
  done.value = [...done.value.slice(-(HISTORY - 1)), change]
  undone.value = []
}

const put = (stroke: WhiteboardStroke) => call.drawStroke({ ...stroke, points: [...stroke.points] })
const take = (stroke: WhiteboardStroke) => call.removeStroke(stroke.id)

function undo() {
  const change = done.value.at(-1)
  if (!change) return
  done.value = done.value.slice(0, -1)
  if (change.type === 'add') {
    if (!call.boardStrokes.has(change.stroke.id)) return undo()
    take(change.stroke)
  } else put(change.stroke)
  undone.value = [...undone.value, change]
}

function redo() {
  const change = undone.value.at(-1)
  if (!change) return
  undone.value = undone.value.slice(0, -1)
  if (change.type === 'add') put(change.stroke)
  else if (call.boardStrokes.has(change.stroke.id)) take(change.stroke)
  done.value = [...done.value, change]
}

function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable="true"]')) return
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return
  const key = event.key.toLowerCase()
  if (key === 'z' && !event.shiftKey) {
    event.preventDefault()
    undo()
  } else if ((key === 'z' && event.shiftKey) || key === 'y') {
    event.preventDefault()
    redo()
  }
}

// --- Pointer input ------------------------------------------------------------------------------------------------

let active: { id: string; pending: number[]; all: number[]; timer: ReturnType<typeof setTimeout> | null; last: [number, number] } | null = null
let shapeStart: [number, number] | null = null
let erasing = false

const newId = () => (typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`).replace(/-/g, '').slice(0, 20)
const owner = () => call.selfUser.value?.id ?? 'self'
const clamp = (value: number) => Math.min(1, Math.max(0, value))

function pointOf(event: PointerEvent | MouseEvent): [number, number] {
  const box = canvas.value!.getBoundingClientRect()
  return [clamp((event.clientX - box.left) / box.width), clamp((event.clientY - box.top) / box.height)]
}

const penTool = () => (tool.value === 'highlighter' ? 'highlighter' : 'pen') as WhiteboardStroke['tool']

function flush() {
  if (!active) return
  if (active.timer) clearTimeout(active.timer)
  active.timer = null
  if (!active.pending.length) return
  call.drawStroke({ id: active.id, kind: 'path', color: color.value, width: size.value, tool: penTool(), points: active.pending.splice(0) })
}

function eraseAt(event: PointerEvent) {
  const [x, y] = pointOf(event)
  const context = canvas.value?.getContext('2d')
  const reach = 10
  const measure = (text: string, fontUnits: number) => {
    if (!context) return text.length * fontUnits * 0.55
    context.font = `600 ${fontUnits}px ui-sans-serif, system-ui, sans-serif`
    return context.measureText(text).width
  }
  for (const stroke of strokes()) {
    if (!canErase(stroke)) continue
    let hit = false
    if (kindOf(stroke) === 'path') {
      for (let index = 0; index < stroke.points.length && !hit; index += 2) {
        const dx = (stroke.points[index]! - x) * cssWidth
        const dy = (stroke.points[index + 1]! - y) * cssHeight
        hit = dx * dx + dy * dy <= reach * reach
      }
    } else {
      const box = boardBounds(stroke, cssWidth / cssHeight || 16 / 9, measure)
      hit = x * cssWidth >= box.left * cssWidth - reach && x * cssWidth <= box.right * cssWidth + reach && y * cssHeight >= box.top * cssHeight - reach && y * cssHeight <= box.bottom * cssHeight + reach
    }
    if (hit) {
      remember({ type: 'erase', stroke: { ...stroke, points: [...stroke.points] } })
      take(stroke)
    }
  }
}

function down(event: PointerEvent) {
  if (readonly || event.button > 0) return
  if (editing.value) return commitText()
  const point = pointOf(event)
  if (tool.value === 'text' || tool.value === 'note') return startText(point, event)
  canvas.value?.setPointerCapture(event.pointerId)
  if (tool.value === 'eraser') {
    erasing = true
    eraseAt(event)
    return
  }
  if (SHAPES.includes(tool.value)) {
    shapeStart = point
    draft.value = { id: newId(), owner: owner(), kind: tool.value as WhiteboardKind, color: color.value, width: size.value, tool: 'pen', points: [...point, ...point] }
    return
  }
  active = { id: newId(), pending: [...point], all: [...point], timer: null, last: point }
  flush()
}

function move(event: PointerEvent) {
  if (erasing) return eraseAt(event)
  if (shapeStart && draft.value) {
    draft.value = { ...draft.value, points: [...shapeStart, ...pointOf(event)] }
    return redraw()
  }
  if (!active) return
  for (const sample of event.getCoalescedEvents?.() ?? [event]) {
    const point = pointOf(sample)
    const dx = (point[0] - active.last[0]) * cssWidth
    const dy = (point[1] - active.last[1]) * cssHeight
    if (dx * dx + dy * dy < 4) continue
    active.pending.push(...point)
    active.all.push(...point)
    active.last = point
  }
  if (active.pending.length >= 300) flush()
  else active.timer ??= setTimeout(flush, FLUSH_MS)
}

function up() {
  erasing = false
  if (shapeStart && draft.value) {
    const shape = draft.value
    shapeStart = null
    draft.value = null
    const [x1, y1, x2, y2] = shape.points as [number, number, number, number]
    // A click without dragging makes no shape.
    if (Math.abs(x2 - x1) * cssWidth + Math.abs(y2 - y1) * cssHeight >= 6) {
      put(shape)
      remember({ type: 'add', stroke: shape })
    } else redraw()
    return
  }
  if (!active) return
  flush()
  remember({ type: 'add', stroke: { id: active.id, owner: owner(), kind: 'path', color: color.value, width: size.value, tool: penTool(), points: active.all } })
  active = null
}

// --- Text and sticky notes ------------------------------------------------------------------------------------------

const editing = ref<{ kind: 'text' | 'note'; point: [number, number]; left: number; top: number } | null>(null)
const words = ref('')
const editorStyle = computed(() => {
  if (!editing.value) return {}
  const note = editing.value.kind === 'note'
  const fontPx = (textSize(size.value, note) * cssWidth) / BOARD_UNITS
  const side = (NOTE_SIZE * cssWidth) / BOARD_UNITS
  return {
    left: `${editing.value.left}px`,
    top: `${editing.value.top}px`,
    fontSize: `${fontPx}px`,
    color: note ? '#1f2937' : color.value,
    background: note ? noteFill(color.value) : 'rgba(255,255,255,0.9)',
    width: note ? `${side}px` : `${Math.max(160, cssWidth * 0.3)}px`,
    height: note ? `${side}px` : 'auto',
    padding: note ? `${side * 0.08}px` : '2px 4px',
  }
})

function startText(point: [number, number], event: PointerEvent) {
  event.preventDefault()
  const box = canvas.value!.getBoundingClientRect()
  const outer = wrap.value!.getBoundingClientRect()
  editing.value = { kind: tool.value as 'text' | 'note', point, left: box.left - outer.left + point[0] * box.width, top: box.top - outer.top + point[1] * box.height }
  words.value = ''
  void nextTick(() => editor.value?.focus())
}

function commitText() {
  const current = editing.value
  const text = words.value.trim().slice(0, 500)
  editing.value = null
  words.value = ''
  if (!current || !text) return
  const item: WhiteboardStroke = { id: newId(), owner: owner(), kind: current.kind, color: color.value, width: size.value, tool: 'pen', points: [...current.point], text }
  put(item)
  remember({ type: 'add', stroke: item })
}

function onEditorKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    editing.value = null
    words.value = ''
  } else if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    commitText()
  }
}

watch(tool, () => editing.value && commitText())

// --- Board actions --------------------------------------------------------------------------------------------------

async function clearAll() {
  const ok = await confirm({ title: 'Clear the whiteboard?', description: 'Everything on it is erased for everyone.', confirmLabel: 'Clear', destructive: true })
  if (!ok) return
  call.clearBoard()
  done.value = []
  undone.value = []
}

function download() {
  const link = document.createElement('a')
  link.download = 'whiteboard.png'
  link.href = canvas.value!.toDataURL('image/png')
  link.click()
}

const toolButton = 'flex size-8 items-center justify-center rounded-md transition-colors disabled:opacity-40'
const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
const cursor = computed(() => (readonly ? '' : tool.value === 'eraser' ? 'cursor-cell' : tool.value === 'text' || tool.value === 'note' ? 'cursor-text' : 'cursor-crosshair'))
</script>

<template>
  <div class="flex size-full min-h-0 flex-col gap-2">
    <div class="flex shrink-0 flex-wrap items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-slate-700 shadow">
      <template v-if="!readonly">
        <button
          v-for="item in TOOLS"
          :key="item.value"
          type="button"
          :class="[toolButton, tool === item.value ? 'bg-slate-900 text-white' : 'hover:bg-slate-100']"
          :title="item.label"
          :aria-label="item.label"
          :aria-pressed="tool === item.value"
          @click="tool = item.value"
        >
          <component :is="item.icon" class="size-4" />
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
        <button type="button" :class="[toolButton, 'hover:bg-slate-100']" :title="`Undo (${mod}+Z)`" aria-label="Undo" :disabled="!done.length" @click="undo"><Undo2 class="size-4" /></button>
        <button type="button" :class="[toolButton, 'hover:bg-slate-100']" :title="`Redo (${mod}+Shift+Z)`" aria-label="Redo" :disabled="!undone.length" @click="redo"><Redo2 class="size-4" /></button>
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
    <div ref="wrap" class="relative flex min-h-0 flex-1 items-center justify-center">
      <canvas
        ref="canvas"
        class="rounded-lg bg-white shadow-lg"
        :class="cursor"
        style="touch-action: none"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
        @lostpointercapture="up"
      />
      <textarea
        v-if="editing"
        ref="editor"
        v-model="words"
        class="absolute z-10 resize-none rounded border border-dashed border-slate-400 leading-tight font-semibold outline-none"
        :style="editorStyle"
        :rows="editing.kind === 'note' ? undefined : 2"
        maxlength="500"
        :placeholder="editing.kind === 'note' ? 'Write a note…' : 'Type…'"
        :aria-label="editing.kind === 'note' ? 'Sticky note text' : 'Text'"
        @keydown.stop="onEditorKey"
        @blur="commitText"
      />
    </div>
  </div>
</template>
