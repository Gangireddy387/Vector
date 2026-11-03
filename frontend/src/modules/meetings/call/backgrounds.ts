import type { BackgroundEffect } from './background-blur'

/**
 * Backgrounds people can put behind themselves in a call: blur, a few built-in scenes (drawn here, so nothing is
 * downloaded), or their own picture (kept in this browser only).
 */

export type BackgroundChoice = { kind: 'none' } | { kind: 'blur' } | { kind: 'preset'; id: string } | { kind: 'custom' }

const WIDTH = 1280
const HEIGHT = 720
const CHOICE_KEY = 'vector.meetings.background'
const LEGACY_BLUR_KEY = 'vector.meetings.blur'
const CUSTOM_KEY = 'vector.meetings.background-image'

type Painter = (context: CanvasRenderingContext2D, width: number, height: number) => void

function gradient(context: CanvasRenderingContext2D, width: number, height: number, stops: string[], angle = 'diagonal') {
  const fill = angle === 'vertical' ? context.createLinearGradient(0, 0, 0, height) : context.createLinearGradient(0, 0, width, height)
  stops.forEach((color, index) => fill.addColorStop(index / (stops.length - 1), color))
  context.fillStyle = fill
  context.fillRect(0, 0, width, height)
}

function bokeh(context: CanvasRenderingContext2D, width: number, height: number, colors: string[], count: number, seed: number) {
  let value = seed
  const random = () => ((value = (value * 9301 + 49297) % 233280) / 233280)
  for (let index = 0; index < count; index += 1) {
    const radius = (0.03 + random() * 0.09) * width
    const x = random() * width
    const y = random() * height
    const glow = context.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, colors[index % colors.length]!)
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    context.fillStyle = glow
    context.fillRect(0, 0, width, height)
  }
}

export const PRESETS: Array<{ id: string; label: string; paint: Painter }> = [
  { id: 'dusk', label: 'Dusk', paint: (c, w, h) => gradient(c, w, h, ['#1e1b4b', '#6d28d9', '#f472b6']) },
  { id: 'ocean', label: 'Ocean', paint: (c, w, h) => gradient(c, w, h, ['#0c4a6e', '#0891b2', '#67e8f9'], 'vertical') },
  { id: 'forest', label: 'Forest', paint: (c, w, h) => gradient(c, w, h, ['#052e16', '#166534', '#86efac']) },
  { id: 'sand', label: 'Sand', paint: (c, w, h) => gradient(c, w, h, ['#fef3c7', '#fde68a', '#f59e0b'], 'vertical') },
  {
    id: 'office',
    label: 'Office',
    paint: (c, w, h) => {
      gradient(c, w, h, ['#e7e5e4', '#d6d3d1', '#a8a29e'], 'vertical')
      bokeh(c, w, h, ['rgba(255,247,237,0.85)', 'rgba(254,215,170,0.55)', 'rgba(255,255,255,0.7)'], 22, 7)
    },
  },
  {
    id: 'studio',
    label: 'Studio',
    paint: (c, w, h) => {
      c.fillStyle = '#0f172a'
      c.fillRect(0, 0, w, h)
      const light = c.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.35, w * 0.6)
      light.addColorStop(0, 'rgba(99,102,241,0.55)')
      light.addColorStop(1, 'rgba(15,23,42,0)')
      c.fillStyle = light
      c.fillRect(0, 0, w, h)
    },
  },
  {
    id: 'city',
    label: 'City lights',
    paint: (c, w, h) => {
      gradient(c, w, h, ['#020617', '#1e293b'], 'vertical')
      bokeh(c, w, h, ['rgba(251,191,36,0.7)', 'rgba(56,189,248,0.6)', 'rgba(244,114,182,0.6)'], 30, 3)
    },
  },
]

function paintPreset(id: string, width = WIDTH, height = HEIGHT) {
  const preset = PRESETS.find((item) => item.id === id) ?? PRESETS[0]!
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  preset.paint(canvas.getContext('2d')!, width, height)
  return canvas
}

const thumbnails = new Map<string, string>()
/** A small picture of a built-in background, for the picker. */
export function presetThumbnail(id: string) {
  if (!thumbnails.has(id)) thumbnails.set(id, paintPreset(id, 160, 90).toDataURL('image/png'))
  return thumbnails.get(id)!
}

export function savedChoice(): BackgroundChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null') as BackgroundChoice | null
    if (saved && ['none', 'blur', 'preset', 'custom'].includes(saved.kind)) return saved
  } catch {
    // Unreadable: fall back below.
  }
  return localStorage.getItem(LEGACY_BLUR_KEY) === '1' ? { kind: 'blur' } : { kind: 'none' }
}

export function saveChoice(choice: BackgroundChoice) {
  localStorage.setItem(CHOICE_KEY, JSON.stringify(choice))
  localStorage.removeItem(LEGACY_BLUR_KEY)
}

export const customImage = () => localStorage.getItem(CUSTOM_KEY)

/** Keeps a picture of the person's own as their background (made smaller, so it fits in this browser's storage). */
export async function saveCustomImage(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture (JPG, PNG or WebP).')
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const context = canvas.getContext('2d')!
  const scale = Math.max(WIDTH / bitmap.width, HEIGHT / bitmap.height)
  context.drawImage(bitmap, (WIDTH - bitmap.width * scale) / 2, (HEIGHT - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale)
  bitmap.close()
  const data = canvas.toDataURL('image/jpeg', 0.82)
  try {
    localStorage.setItem(CUSTOM_KEY, data)
  } catch {
    throw new Error('That picture is too large to keep in this browser. Try a smaller one.')
  }
  return data
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('The background picture could not be loaded.'))
    image.src = source
  })
}

/** What to draw for a choice (null: no effect). */
export async function effectFor(choice: BackgroundChoice): Promise<BackgroundEffect | null> {
  if (choice.kind === 'none') return null
  if (choice.kind === 'blur') return { kind: 'blur' }
  if (choice.kind === 'preset') return { kind: 'image', image: paintPreset(choice.id) }
  const data = customImage()
  return data ? { kind: 'image', image: await loadImage(data) } : { kind: 'blur' }
}
