<script lang="ts">
export interface LogoTraits {
  /** Wordmark (icon plus name) rather than a square icon. */
  wide: boolean
  /** Has see-through areas, so it is shown without a frame or backing. */
  transparent: boolean
  /** Mostly dark artwork, which needs a light outline on dark backgrounds. */
  darkInk: boolean
}

const WIDE_RATIO = 1.6
/** Remembered per image so a logo keeps its look across pages without a flash. */
const traitsCache = new Map<string, LogoTraits>()

/** Samples a small copy of the image; cross-origin images that cannot be read keep the framed look. */
export function analyzeLogo(image: HTMLImageElement): LogoTraits {
  const ratio = image.naturalWidth / image.naturalHeight
  const traits: LogoTraits = { wide: ratio >= WIDE_RATIO, transparent: false, darkInk: false }
  try {
    const width = 64
    const height = Math.max(1, Math.round(width / ratio))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return traits
    context.drawImage(image, 0, 0, width, height)
    const { data } = context.getImageData(0, 0, width, height)
    let seeThrough = 0
    let inkWeight = 0
    let inkLightness = 0
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3]! / 255
      if (alpha < 0.98) seeThrough += 1
      const lightness = (0.2126 * data[index]! + 0.7152 * data[index + 1]! + 0.0722 * data[index + 2]!) / 255
      inkWeight += alpha
      inkLightness += lightness * alpha
    }
    traits.transparent = seeThrough > (width * height) / 50
    traits.darkInk = inkWeight > 0 && inkLightness / inkWeight < 0.45
  } catch {
    // Tainted canvas (logo served from another origin): fall back to the framed look.
  }
  return traits
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'

/**
 * An organization's brand logo at a readable size. Wide wordmarks show in full; square icons, or any logo when
 * `square` is set (collapsed sidebar), show as a tile. Transparent logos are shown as uploaded, with no backing.
 * `v-model:wide` reports the shape so callers can skip repeating the name next to a wordmark.
 */
const props = withDefaults(
  defineProps<{
    src: string
    alt?: string
    size?: 'sm' | 'md' | 'lg'
    square?: boolean
    /** No frame at all, for brand areas like the sidebar header. */
    bare?: boolean
    class?: string
  }>(),
  { alt: '', size: 'md', square: false, bare: false },
)
const wide = defineModel<boolean>('wide', { default: false })

const TILE = { sm: 'size-8', md: 'size-10', lg: 'size-12' }
const BANNER = { sm: 'h-8 max-w-36', md: 'h-10 max-w-44', lg: 'h-12 max-w-56' }
/** Keeps dark lettering readable on dark backgrounds without filling in the transparent areas. */
const DARK_INK_OUTLINE = 'dark:drop-shadow-[0_0_1px_rgb(255_255_255/0.9)] dark:drop-shadow-[0_0_6px_rgb(255_255_255/0.25)]'

const traits = ref<LogoTraits | null>(traitsCache.get(props.src) ?? null)
watch(
  () => props.src,
  (src) => (traits.value = traitsCache.get(src) ?? null),
)
watch(() => traits.value?.wide ?? false, (value) => (wide.value = value), { immediate: true })

const isWide = computed(() => Boolean(traits.value?.wide) && !props.square)
const framed = computed(() => !props.bare && !traits.value?.transparent)
const imageClass = computed(() => traits.value?.transparent && traits.value.darkInk && DARK_INK_OUTLINE)

function measure(event: Event) {
  const image = event.target as HTMLImageElement
  if (!image.naturalWidth || !image.naturalHeight) return
  const next = analyzeLogo(image)
  traitsCache.set(props.src, next)
  traits.value = next
}
</script>

<template>
  <span
    v-if="isWide"
    :class="
      cn('inline-flex shrink-0 items-center', framed ? 'justify-center overflow-hidden border border-border/70 bg-white px-2 py-1' : 'justify-start', BANNER[size], props.class)
    "
  >
    <img :src="src" :alt="alt" class="h-full w-auto max-w-full object-contain" :class="imageClass" @load="measure" />
  </span>
  <span v-else :class="cn('flex shrink-0 items-center justify-center', framed && 'overflow-hidden border border-border bg-white', TILE[size], props.class)">
    <img :src="src" :alt="alt" class="size-full object-contain" :class="[framed && 'p-0.5', imageClass]" @load="measure" />
  </span>
</template>
