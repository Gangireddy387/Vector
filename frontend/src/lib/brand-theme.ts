/**
 * Organization theme colours. An organization picks a named theme or its own colour (often taken from its logo);
 * the colour is turned into readable accent values for light and dark mode and written as CSS variables on <html>
 * (see the --brand-* tokens in main.css). The values are cached so public/theme-init.js can apply them before first paint.
 */

export const BRAND_STORAGE_KEY = 'vector.brand'
/** Soft default so the sidebar reads as a light tint, not a loud wash. 0 = near-neutral, 100 = bold. */
export const DEFAULT_BRAND_BRIGHTNESS = 40
export const BRAND_BRIGHTNESS_MIN = 0
export const BRAND_BRIGHTNESS_MAX = 100

type Ink = 'light' | 'dark'

export interface BrandTone {
  /** Hue, 0–360. */
  h: number
  /** Chroma and lightness of the accent in light mode, and the text colour on it. */
  c: number
  l: number
  fg: Ink
  /** The same for dark mode. */
  cDark: number
  lDark: number
  fgDark: Ink
  /** Hue offset of the second gradient stop (brand buttons, logo tile). */
  shift: number
  /** How strongly the greys (sidebar, borders, panels) lean towards the hue. */
  tint: number
}

export interface BrandTheme {
  id: string
  label: string
  description: string
  tone: BrandTone
}

const tone = (h: number, c: number, l: number, cDark: number, lDark: number, extra: Partial<BrandTone> = {}): BrandTone => ({
  h,
  c,
  l,
  fg: 'light',
  cDark,
  lDark,
  fgDark: 'light',
  shift: 30,
  // Strong enough that sidebar/canvas read as “this org”, not a grey sheet.
  tint: 0.016,
  ...extra,
})

/** Studio / named colourways that ship with Vector. */
export const STUDIO_BRAND_THEMES: BrandTheme[] = [
  { id: 'vector', label: 'Vector', description: 'Electric indigo', tone: tone(275, 0.2, 0.55, 0.17, 0.67, { tint: 0.014 }) },
  { id: 'ocean', label: 'Ocean', description: 'Deep sea blue', tone: tone(250, 0.17, 0.53, 0.15, 0.69, { shift: -35 }) },
  { id: 'lagoon', label: 'Lagoon', description: 'Calm teal', tone: tone(200, 0.12, 0.54, 0.11, 0.74, { shift: -30, fgDark: 'dark' }) },
  { id: 'emerald', label: 'Emerald', description: 'Fresh green', tone: tone(160, 0.15, 0.52, 0.15, 0.74, { shift: -30, fgDark: 'dark' }) },
  { id: 'amber', label: 'Amber', description: 'Warm gold', tone: tone(72, 0.16, 0.77, 0.15, 0.8, { shift: -22, fg: 'dark', fgDark: 'dark' }) },
  { id: 'sunset', label: 'Sunset', description: 'Bold orange', tone: tone(42, 0.19, 0.6, 0.17, 0.7, { shift: -18 }) },
  { id: 'ruby', label: 'Ruby', description: 'Confident red', tone: tone(20, 0.2, 0.55, 0.18, 0.67, { shift: 18 }) },
  { id: 'rose', label: 'Rose', description: 'Vivid pink', tone: tone(355, 0.2, 0.57, 0.17, 0.7, { shift: -25 }) },
  { id: 'grape', label: 'Grape', description: 'Royal purple', tone: tone(305, 0.2, 0.53, 0.17, 0.69, { shift: 30 }) },
  { id: 'graphite', label: 'Graphite', description: 'Monochrome', tone: tone(270, 0.012, 0.27, 0.01, 0.92, { shift: 0, fgDark: 'dark', tint: 0.004 }) },
]

/**
 * Familiar brand-inspired palettes — one clear hue each (no near-duplicates like
 * Google/Meta/LinkedIn blues or Netflix/YouTube reds).
 */
export const POPULAR_BRAND_THEMES: BrandTheme[] = [
  // Google Blue #4285F4
  { id: 'google', label: 'Google', description: 'Clear product blue', tone: tone(255, 0.17, 0.58, 0.15, 0.72, { shift: -28 }) },
  // Instagram mid gradient #C13584
  { id: 'instagram', label: 'Instagram', description: 'Gradient magenta', tone: tone(350, 0.2, 0.55, 0.17, 0.7, { shift: -45 }) },
  // Amazon #FF9900
  { id: 'amazon', label: 'Amazon', description: 'Marketplace orange', tone: tone(70, 0.17, 0.76, 0.15, 0.82, { shift: -18, fg: 'dark', fgDark: 'dark' }) },
  // Spotify #1DB954
  { id: 'spotify', label: 'Spotify', description: 'Audio green', tone: tone(150, 0.17, 0.64, 0.15, 0.76, { shift: -22, fgDark: 'dark' }) },
  // Netflix #E50914
  { id: 'netflix', label: 'Netflix', description: 'Streaming red', tone: tone(25, 0.22, 0.55, 0.19, 0.66, { shift: 12 }) },
  // Slack aubergine #4A154B
  { id: 'slack', label: 'Slack', description: 'Workspace aubergine', tone: tone(328, 0.14, 0.38, 0.12, 0.66, { shift: 25 }) },
]

/** All selectable named themes (popular brands first, then studio colourways). */
export const BRAND_THEMES: BrandTheme[] = [...POPULAR_BRAND_THEMES, ...STUDIO_BRAND_THEMES]

export const DEFAULT_BRAND = STUDIO_BRAND_THEMES[0]!

const HEX = /^#[0-9a-f]{6}$/i
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// --- Colour maths (sRGB ⇄ OKLCH) ---------------------------------------------------

const toLinear = (channel: number) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function rgbToOklch(r: number, g: number, b: number) {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

export function hexToOklch(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16)
  return rgbToOklch((value >> 16) & 255, (value >> 8) & 255, value & 255)
}

export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`

/** Accent values for any colour: kept close to the original, but light/dark enough that text on it stays readable. */
export function toneFromHex(hex: string): BrandTone {
  const { l, c, h } = hexToOklch(hex)
  if (c < 0.035) return { ...BRAND_THEMES.find((theme) => theme.id === 'graphite')!.tone, h }
  const chroma = clamp(c, 0.08, 0.22)
  const isYellow = h > 70 && h < 118
  const lightL = isYellow ? 0.78 : clamp(l, 0.45, 0.6)
  const darkL = isYellow ? 0.82 : clamp(l + 0.12, 0.66, 0.76)
  return {
    h,
    c: chroma,
    l: lightL,
    fg: lightL > 0.7 ? 'dark' : 'light',
    cDark: Math.min(chroma, 0.18),
    lDark: darkL,
    fgDark: darkL >= 0.72 ? 'dark' : 'light',
    shift: h > 25 && h < 120 ? -20 : 30,
    tint: 0.016,
  }
}

/** Human label for a saved brand value (theme id, hex, or Vector default). */
export function brandLabel(value: string | null | undefined): string {
  if (!value || value === DEFAULT_BRAND.id) return DEFAULT_BRAND.label
  if (HEX.test(value)) return value.toLowerCase()
  return BRAND_THEMES.find((theme) => theme.id === value)?.label ?? DEFAULT_BRAND.label
}

/** The theme for an organization's saved value: a theme id, a hex colour, or nothing (Vector's own). */
export function resolveBrand(value: string | null | undefined): BrandTone {
  if (value && HEX.test(value)) return toneFromHex(value)
  return (BRAND_THEMES.find((theme) => theme.id === value) ?? DEFAULT_BRAND).tone
}

/** A CSS colour for showing the accent itself, e.g. in swatches. */
export const swatchColor = (t: BrandTone, dark = false) => (dark ? `oklch(${t.lDark} ${t.cDark} ${t.h})` : `oklch(${t.l} ${t.c} ${t.h})`)

/** Tailwind-style shade steps for exploring a brand ramp. */
export const PALETTE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type PaletteStep = (typeof PALETTE_STEPS)[number]

export interface PaletteShade {
  step: PaletteStep
  color: string
  ink: string
}

/** Build a 50→950 shade ramp from a brand tone for palette chips. */
export function brandPalette(tone: BrandTone): PaletteShade[] {
  const lights: Record<PaletteStep, number> = {
    50: 0.97,
    100: 0.93,
    200: 0.87,
    300: 0.78,
    400: 0.68,
    500: clamp(tone.l, 0.45, 0.62),
    600: clamp(tone.l - 0.08, 0.4, 0.55),
    700: 0.42,
    800: 0.33,
    900: 0.25,
    950: 0.18,
  }
  return PALETTE_STEPS.map((step) => {
    const l = lights[step]
    const chromaScale = step <= 100 ? 0.35 : step <= 300 ? 0.65 : step <= 600 ? 1 : step <= 800 ? 0.85 : 0.55
    const c = tone.c * chromaScale
    const color = `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${tone.h.toFixed(1)})`
    return { step, color, ink: l > 0.72 ? `oklch(0.22 0.03 ${tone.h.toFixed(1)})` : 'oklch(0.99 0 0)' }
  })
}

const ink = (kind: Ink, h: number) => (kind === 'light' ? 'oklch(0.99 0 0)' : `oklch(0.2 0.03 ${h.toFixed(1)})`)

/** Normalize a saved brightness (null / undefined → soft default). */
export function resolveBrandBrightness(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return DEFAULT_BRAND_BRIGHTNESS
  return clamp(Math.round(value), BRAND_BRIGHTNESS_MIN, BRAND_BRIGHTNESS_MAX)
}

function cssVariables(t: BrandTone, brightness: number): Record<string, string> {
  // Theme tint values were authored around mid-strength; scale by brightness / 50.
  const strength = resolveBrandBrightness(brightness) / 50
  return {
    '--brand-h': t.h.toFixed(1),
    '--brand-c': t.c.toFixed(3),
    '--brand-l': t.l.toFixed(3),
    '--brand-fg': ink(t.fg, t.h),
    '--brand-c-dark': t.cDark.toFixed(3),
    '--brand-l-dark': t.lDark.toFixed(3),
    '--brand-fg-dark': ink(t.fgDark, t.h),
    '--brand-shift': String(t.shift),
    '--tint-c': (t.tint * strength).toFixed(4),
    '--brand-brightness': (resolveBrandBrightness(brightness) / 100).toFixed(3),
  }
}

/** Paints the app in an organization's theme colour (null = Vector's own) and remembers it for the next page load. */
export function applyBrand(
  value: string | null | undefined,
  { remember = true, brightness }: { remember?: boolean; brightness?: number | null } = {},
) {
  const root = document.documentElement
  const resolvedBrightness = resolveBrandBrightness(brightness)
  const variables = cssVariables(resolveBrand(value), resolvedBrightness)
  const isDefaultColor = !value || value === DEFAULT_BRAND.id
  const isDefaultBrightness = resolvedBrightness === DEFAULT_BRAND_BRIGHTNESS
  const isDefault = isDefaultColor && isDefaultBrightness
  // Always write tint / brightness so @property transitions can ease (removeProperty snaps).
  const surfaceKeys = new Set(['--tint-c', '--brand-brightness'])
  for (const [name, css] of Object.entries(variables)) {
    if (isDefault && !surfaceKeys.has(name)) root.style.removeProperty(name)
    else root.style.setProperty(name, css)
  }
  if (!remember) return
  try {
    if (isDefault) localStorage.removeItem(BRAND_STORAGE_KEY)
    else localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(variables))
  } catch {
    /* storage full or blocked: the colour still applies for this visit */
  }
}

/**
 * The most prominent colour in an image (an organization logo), ignoring transparent, white and black areas.
 * Logos that are only greys give their average grey, which becomes the monochrome theme.
 */
export async function colorFromImage(url: string): Promise<string | null> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  const size = 48
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(image, 0, 0, size, size)
  const { data } = context.getImageData(0, 0, size, size)

  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>()
  const grey = { count: 0, r: 0, g: 0, b: 0 }
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
    if (a < 200) continue
    const { l, c, h } = rgbToOklch(r, g, b)
    if (l > 0.96) continue
    if (c < 0.04 || l < 0.15) {
      grey.count += 1
      grey.r += r
      grey.g += g
      grey.b += b
      continue
    }
    const key = Math.round(h / 24) % 15
    const bucket = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 }
    const weight = c * c
    bucket.weight += weight
    bucket.r += r * weight
    bucket.g += g * weight
    bucket.b += b * weight
    buckets.set(key, bucket)
  }

  const best = [...buckets.values()].sort((x, y) => y.weight - x.weight)[0]
  if (best && best.weight > 0.02) return rgbToHex(best.r / best.weight, best.g / best.weight, best.b / best.weight)
  if (grey.count) return rgbToHex(grey.r / grey.count, grey.g / grey.count, grey.b / grey.count)
  return null
}
