<script setup lang="ts">
import { Move, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, reactive, ref, useTemplateRef, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Slider } from '@/components/ui/slider'
import { canvasToUpload, type CropFrame, drawCrop, fitZoom, loadImage, panLimits, renderCrop } from '@/lib/image'

/**
 * `avatar`: round crop that always fills the frame. `logo`: square icon or wide wordmark (3:1) that can zoom out
 * until the whole image fits, keeping transparency.
 */
const props = withDefaults(defineProps<{ file: File | null; saving?: boolean; variant?: 'avatar' | 'logo' }>(), { variant: 'avatar' })
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ save: [blob: Blob, fileName: string] }>()

const VARIANTS = {
  avatar: {
    title: 'Adjust your photo',
    description: 'Drag to position, zoom to frame your face, then save.',
    saveLabel: 'Save photo',
    output: 320,
    round: true,
    previews: [
      { size: 56, label: 'Profile' },
      { size: 36, label: 'Comments' },
      { size: 24, label: 'Cards' },
    ],
  },
  logo: {
    title: 'Adjust your logo',
    description: 'Pick the shape that matches your logo, then drag and zoom to frame it. Empty space stays transparent.',
    saveLabel: 'Save logo',
    output: 512,
    round: false,
    previews: [
      { size: 56, label: 'Settings' },
      { size: 32, label: 'Sidebar' },
      { size: 24, label: 'Small' },
    ],
  },
} as const

const VIEWPORT = 288
const MAX_ZOOM = 4
/** Shows which parts of a logo are transparent. */
const CHECKERBOARD = { background: 'repeating-conic-gradient(#e5e7eb 0 25%, #ffffff 0 50%) 0 0 / 16px 16px' }

/** Wordmarks (icon plus name) keep their width instead of shrinking into a square. */
const LOGO_SHAPES = {
  square: { label: 'Square icon', aspect: 1, output: 512 },
  wide: { label: 'Wide logo with name', aspect: 3, output: 960 },
} as const
const WIDE_IMAGE_RATIO = 1.6

const options = computed(() => VARIANTS[props.variant])
const logoShape = ref<keyof typeof LOGO_SHAPES>('square')
const aspect = computed(() => (props.variant === 'logo' ? LOGO_SHAPES[logoShape.value].aspect : 1))
const viewportCanvas = useTemplateRef<HTMLCanvasElement>('viewportCanvas')
const image = ref<ImageBitmap | null>(null)
const frame = reactive<CropFrame>({ viewport: VIEWPORT, aspect: 1, zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 })
const preview = ref('')
const isDragging = ref(false)

const minZoom = computed(() =>
  props.variant === 'logo' && image.value ? Math.floor(fitZoom(image.value.width, image.value.height, { ...frame, rotation: 0 }) * 100) / 100 : 1,
)

/** Logos start fully visible; photos start filling the frame. */
function resetFrame() {
  frame.aspect = aspect.value
  Object.assign(frame, { offsetX: 0, offsetY: 0, rotation: 0 })
  frame.zoom = props.variant === 'logo' ? minZoom.value : 1
}
watch(logoShape, resetFrame)

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
      const loaded = await loadImage(file)
      if (props.variant === 'logo') logoShape.value = loaded.width / loaded.height >= WIDE_IMAGE_RATIO ? 'wide' : 'square'
      image.value = loaded
      resetFrame()
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
  const width = VIEWPORT * pixelRatio
  const height = Math.round(width / frame.aspect)
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  const context = canvas.getContext('2d')
  if (!context) return
  drawCrop(context, image.value, frame, width)
  preview.value = renderCrop(image.value, frame, Math.round(96 * frame.aspect)).toDataURL('image/png')
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
  frame.zoom = Math.round(Math.min(MAX_ZOOM, Math.max(minZoom.value, value)) * 100) / 100
  clampPan()
}
const zoomModel = computed({
  get: () => [frame.zoom],
  set: (value: number[] | undefined) => setZoom(value?.[0] ?? minZoom.value),
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
  const output = props.variant === 'logo' ? LOGO_SHAPES[logoShape.value].output : options.value.output
  const { blob, fileName } = await canvasToUpload(renderCrop(image.value, frame, output), { transparent: props.variant === 'logo' })
  emit('save', blob, fileName)
}

const isGif = computed(() => props.file?.type === 'image/gif')
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="gap-5 sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{{ options.title }}</DialogTitle>
        <DialogDescription>{{ options.description }}</DialogDescription>
      </DialogHeader>

      <div class="grid items-center gap-6 sm:grid-cols-[auto_minmax(0,1fr)]">
        <!-- Crop viewport -->
        <div class="mx-auto space-y-3">
          <div
            class="relative w-72 touch-none overflow-hidden border border-border outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
            :class="[isDragging ? 'cursor-grabbing' : 'cursor-grab', options.round && 'bg-muted']"
            :style="{ height: `${VIEWPORT / frame.aspect}px`, ...(options.round ? {} : CHECKERBOARD) }"
            tabindex="0"
            role="application"
            :aria-label="`${variant === 'logo' ? 'Logo' : 'Photo'} crop area. Drag or use arrow keys to move, plus and minus to zoom.`"
            @pointerdown="onPointerDown"
            @pointermove="onPointerMove"
            @pointerup="onPointerUp"
            @pointercancel="onPointerUp"
            @wheel.prevent="onWheel"
            @keydown="onKeydown"
          >
            <canvas ref="viewportCanvas" class="size-full" />
            <!-- Photos: everything outside the circle is veiled. Logos keep the whole square. -->
            <div
              v-if="options.round"
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
          <div v-if="variant === 'logo'" class="space-y-2">
            <span class="text-sm font-medium">Shape</span>
            <div class="grid grid-cols-2 gap-1 border border-border/80 bg-muted/40 p-0.5" role="radiogroup" aria-label="Logo shape">
              <button
                v-for="(shape, key) in LOGO_SHAPES"
                :key="key"
                type="button"
                role="radio"
                :aria-checked="logoShape === key"
                class="flex items-center justify-center gap-2 px-2 py-1.5 text-xs font-medium transition-all"
                :class="logoShape === key ? 'bg-card text-foreground shadow-sm ring-1 ring-border/70' : 'text-muted-foreground hover:text-foreground'"
                @click="logoShape = key"
              >
                <span class="border border-current" :class="key === 'wide' ? 'h-2.5 w-7' : 'size-3.5'" />
                {{ shape.label }}
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="font-medium">Zoom</span>
              <span class="text-xs text-muted-foreground tabular-nums">{{ Math.round(frame.zoom * 100) }}%</span>
            </div>
            <div class="flex items-center gap-2">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Zoom out" :disabled="frame.zoom <= minZoom" @click="setZoom(frame.zoom - 0.25)">
                <ZoomOut />
              </Button>
              <Slider v-model="zoomModel" :min="minZoom" :max="MAX_ZOOM" :step="0.01" thumb-label="Zoom" />
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
            <div class="flex flex-wrap items-end gap-4">
              <figure v-for="{ size, label } in options.previews" :key="size" class="flex flex-col items-center gap-1.5">
                <img
                  v-if="preview"
                  :src="preview"
                  alt=""
                  class="border border-border object-cover shadow-soft"
                  :class="options.round ? 'rounded-full' : 'bg-white'"
                  :style="{ width: `${size * frame.aspect}px`, height: `${size}px` }"
                />
                <span v-else class="bg-muted" :class="options.round && 'rounded-full'" :style="{ width: `${size * frame.aspect}px`, height: `${size}px` }" />
                <figcaption class="text-[10px] text-muted-foreground">{{ label }}</figcaption>
              </figure>
            </div>
          </div>

          <p v-if="isGif" class="text-xs text-muted-foreground">Animated GIFs are saved as a still image.</p>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" :disabled="saving" @click="open = false">Cancel</Button>
        <Button type="button" :loading="saving" :disabled="!image" @click="save">{{ options.saveLabel }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
