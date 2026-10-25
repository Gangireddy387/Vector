<script setup lang="ts">
import { Move, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { canvasToUpload, type CropFrame, drawCrop, loadImage, panLimits, renderCrop } from '@/lib/image'

const props = defineProps<{ file: File | null; saving?: boolean }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [blob: Blob, fileName: string] }>()

const VIEWPORT = 288
const OUTPUT = 320
const MIN_ZOOM = 1
const MAX_ZOOM = 4

const viewportCanvas = useTemplateRef<HTMLCanvasElement>('viewportCanvas')
const image = ref<ImageBitmap | null>(null)
const frame = reactive<CropFrame>({ viewport: VIEWPORT, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })
const preview = ref('')
const isDragging = ref(false)

function resetFrame() {
  Object.assign(frame, { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })
}

/** Keeps the image covering the whole frame after any zoom, pan or rotation. */
function clampPan() {
  if (!image.value) return
  const limits = panLimits(image.value.width, image.value.height, frame)
  frame.offsetX = Math.min(limits.x, Math.max(-limits.x, frame.offsetX))
  frame.offsetY = Math.min(limits.y, Math.max(-limits.y, frame.offsetY))
}

watch(
  () => [open.value, props.file] as const,
  async ([isOpen, file]) => {
    if (!isOpen || !file) return
    resetFrame()
    image.value?.close()
    image.value = null
    try {
      image.value = await loadImage(file)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That image could not be opened.')
      open.value = false
    }
  },
  { immediate: true },
)
onBeforeUnmount(() => image.value?.close())

/** Redraws the frame and the small previews; changes made in the same tick are batched into one paint. */
function paint() {
  const canvas = viewportCanvas.value
  if (!canvas || !image.value) return
  const pixelRatio = window.devicePixelRatio || 1
  if (canvas.width !== VIEWPORT * pixelRatio) {
    canvas.width = VIEWPORT * pixelRatio
    canvas.height = VIEWPORT * pixelRatio
  }
  const context = canvas.getContext('2d')
  if (!context) return
  drawCrop(context, image.value, frame, VIEWPORT * pixelRatio)
  preview.value = renderCrop(image.value, frame, 96).toDataURL('image/png')
}
watch([image, () => ({ ...frame })], async () => {
  await nextTick()
  paint()
})

// --- Pan by dragging --------------------------------------------------------
let dragStart = { x: 0, y: 0, offsetX: 0, offsetY: 0 }
function onPointerDown(event: PointerEvent) {
  if (!image.value) return
  isDragging.value = true
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  dragStart = { x: event.clientX, y: event.clientY, offsetX: frame.offsetX, offsetY: frame.offsetY }
}
function onPointerMove(event: PointerEvent) {
  if (!isDragging.value) return
  const element = event.currentTarget as HTMLElement
  const cssToFrame = VIEWPORT / element.getBoundingClientRect().width
  frame.offsetX = dragStart.offsetX + (event.clientX - dragStart.x) * cssToFrame
  frame.offsetY = dragStart.offsetY + (event.clientY - dragStart.y) * cssToFrame
  clampPan()
}
function onPointerUp() {
  isDragging.value = false
}

// --- Zoom and rotate ----------------------------------------------------------
function setZoom(value: number) {
  frame.zoom = Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value)) * 100) / 100
  clampPan()
}
const zoomModel = computed({
  get: () => [frame.zoom],
  set: (value: number[] | undefined) => setZoom(value?.[0] ?? MIN_ZOOM),
})
function onWheel(event: WheelEvent) {
  setZoom(frame.zoom - Math.sign(event.deltaY) * 0.1)
}
function rotate(step: 90 | -90) {
  frame.rotation = (frame.rotation + step + 360) % 360
  clampPan()
}
function onKeydown(event: KeyboardEvent) {
  const nudge = event.shiftKey ? 24 : 6
  const moves: Record<string, () => void> = {
    ArrowLeft: () => (frame.offsetX += nudge),
    ArrowRight: () => (frame.offsetX -= nudge),
    ArrowUp: () => (frame.offsetY += nudge),
    ArrowDown: () => (frame.offsetY -= nudge),
    '+': () => setZoom(frame.zoom + 0.1),
    '=': () => setZoom(frame.zoom + 0.1),
    '-': () => setZoom(frame.zoom - 0.1),
  }
  const move = moves[event.key]
  if (!move) return
  event.preventDefault()
  move()
  clampPan()
}

async function save() {
  if (!image.value) return
  const { blob, fileName } = await canvasToUpload(renderCrop(image.value, frame, OUTPUT))
  emit('save', blob, fileName)
}

const isGif = computed(() => props.file?.type === 'image/gif')
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-5 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Adjust your photo</DialogTitle>
        <DialogDescription>Drag to position, zoom to frame your face, then save.</DialogDescription>
      </DialogHeader>

      <div class="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <!-- Crop viewport -->
        <div class="mx-auto space-y-3">
          <div
            class="relative size-72 touch-none overflow-hidden border border-border bg-muted outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            :class="isDragging ? 'cursor-grabbing' : 'cursor-grab'"
            tabindex="0"
            role="application"
            aria-label="Photo crop area. Drag or use arrow keys to move, plus and minus to zoom."
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
            @keydown="onKeydown"
          >
            <canvas ref="viewportCanvas" class="size-full" />
            <!-- Circular frame: everything outside it is veiled. -->
            <div
              class="pointer-events-none absolute inset-0 rounded-full ring-2 ring-white/90"
              style="box-shadow: 0 0 0 999px color-mix(in oklch, var(--background) 62%, transparent)"
            />
            <div
              v-if="!image"
              class="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
            >
              Loading image…
            </div>
          </div>
          <p class="flex items-center justify-center gap-1.5 text-xs text-muted-foreground"><Move class="size-3.5" /> Drag to move · scroll to zoom</p>
        </div>

        <!-- Controls + preview -->
        <div class="space-y-5">
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Zoom</span>
              <span class="text-xs text-muted-foreground tabular-nums">{{ Math.round(frame.zoom * 100) }}%</span>
            </div>
            <div class="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" :disabled="frame.zoom <= MIN_ZOOM" @click="setZoom(frame.zoom - 0.25)">
                <ZoomOut />
              </Button>
              <Slider v-model="zoomModel" :min="MIN_ZOOM" :max="MAX_ZOOM" :step="0.01" thumb-label="Zoom" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom in" :disabled="frame.zoom >= MAX_ZOOM" @click="setZoom(frame.zoom + 0.25)">
                <ZoomIn />
              </Button>
            </div>
          </div>

          <div class="space-y-2">
            <span class="text-sm font-medium">Rotate</span>
            <div class="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" @click="rotate(-90)"><RotateCcw /> Left</Button>
              <Button type="button" variant="outline" size="sm" @click="rotate(90)"><RotateCw /> Right</Button>
              <Button type="button" variant="ghost" size="sm" @click="resetFrame"><Undo2 /> Reset</Button>
            </div>
          </div>

          <div class="space-y-2">
            <span class="text-sm font-medium">Preview</span>
            <div class="flex items-end gap-4">
              <figure v-for="size in [56, 36, 24]" :key="size" class="flex flex-col items-center gap-1.5">
                <img
                  v-if="preview"
                  :src="preview"
                  alt=""
                  class="rounded-full border border-border object-cover shadow-soft"
                  :style="{ width: `${size}px`, height: `${size}px` }"
                />
                <span v-else class="rounded-full bg-muted" :style="{ width: `${size}px`, height: `${size}px` }" />
                <figcaption class="text-[10px] text-muted-foreground">{{ size === 56 ? 'Profile' : size === 36 ? 'Comments' : 'Cards' }}</figcaption>
              </figure>
            </div>
          </div>

          <p v-if="isGif" class="text-xs text-muted-foreground">Animated GIFs are saved as a still image.</p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" :disabled="saving" @click="open = false">Cancel</Button>
        <Button type="button" :loading="saving" :disabled="!image" @click="save">Save photo</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
