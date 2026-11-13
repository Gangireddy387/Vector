/**
 * Organization theme colours. An organization picks a named theme or its own colour (often taken from its logo);
 * the colour is turned into readable accent values for light and dark mode and written as CSS variables on <html>
 * (see the --brand-* tokens in main.css). The values are cached so public/theme-init.js can apply them before first paint.
 */

export const BRAND_STORAGE_KEY = 'vector.brand'

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
  tint: 0.009,
  ...extra,
})

export const BRAND_THEMES: BrandTheme[] = [
  { id: 'vector', label: 'Vector', description: 'Electric indigo', tone: tone(275, 0.2, 0.55, 0.17, 0.67, { tint: 0.006 }) },
  { id: 'ocean', label: 'Ocean', description: 'Deep sea blue', tone: tone(250, 0.17, 0.53, 0.15, 0.69, { shift: -35 }) },
  { id: 'lagoon', label: 'Lagoon', description: 'Calm teal', tone: tone(200, 0.12, 0.54, 0.11, 0.74, { shift: -30, fgDark: 'dark' }) },
  { id: 'emerald', label: 'Emerald', description: 'Fresh green', tone: tone(160, 0.15, 0.52, 0.15, 0.74, { shift: -30, fgDark: 'dark' }) },
  { id: 'amber', label: 'Amber', description: 'Warm gold', tone: tone(72, 0.16, 0.77, 0.15, 0.8, { shift: -22, fg: 'dark', fgDark: 'dark' }) },
  { id: 'sunset', label: 'Sunset', description: 'Bold orange', tone: tone(42, 0.19, 0.6, 0.17, 0.7, { shift: -18 }) },
  { id: 'ruby', label: 'Ruby', description: 'Confident red', tone: tone(20, 0.2, 0.55, 0.18, 0.67, { shift: 18 }) },
  { id: 'rose', label: 'Rose', description: 'Vivid pink', tone: tone(355, 0.2, 0.57, 0.17, 0.7, { shift: -25 }) },
  { id: 'grape', label: 'Grape', description: 'Royal purple', tone: tone(305, 0.2, 0.53, 0.17, 0.69, { shift: 30 }) },
  { id: 'graphite', label: 'Graphite', description: 'Monochrome', tone: tone(270, 0.012, 0.27, 0.01, 0.92, { shift: 0, fgDark: 'dark', tint: 0.003 }) },
]

export const DEFAULT_BRAND = BRAND_THEMES[0]!

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
    tint: 0.009,
  }
}

/** The theme for an organization's saved value: a theme id, a hex colour, or nothing (Vector's own). */
export function resolveBrand(value: string | null | undefined): BrandTone {
  if (value && HEX.test(value)) return toneFromHex(value)
  return (BRAND_THEMES.find((theme) => theme.id === value) ?? DEFAULT_BRAND).tone
}

/** A CSS colour for showing the accent itself, e.g. in swatches. */
export const swatchColor = (t: BrandTone, dark = false) => (dark ? `oklch(${t.lDark} ${t.cDark} ${t.h})` : `oklch(${t.l} ${t.c} ${t.h})`)

const ink = (kind: Ink, h: number) => (kind === 'light' ? 'oklch(0.99 0 0)' : `oklch(0.2 0.03 ${h.toFixed(1)})`)

function cssVariables(t: BrandTone): Record<string, string> {
  return {
    '--brand-h': t.h.toFixed(1),
    '--brand-c': t.c.toFixed(3),
    '--brand-l': t.l.toFixed(3),
    '--brand-fg': ink(t.fg, t.h),
    '--brand-c-dark': t.cDark.toFixed(3),
    '--brand-l-dark': t.lDark.toFixed(3),
    '--brand-fg-dark': ink(t.fgDark, t.h),
    '--brand-shift': String(t.shift),
    '--tint-c': String(t.tint),
  }
}

/** Paints the app in an organization's theme colour (null = Vector's own) and remembers it for the next page load. */
export function applyBrand(value: string | null | undefined, { remember = true } = {}) {
  const root = document.documentElement
  const variables = cssVariables(resolveBrand(value))
  const isDefault = !value || value === DEFAULT_BRAND.id
  for (const [name, css] of Object.entries(variables)) {
    if (isDefault) root.style.removeProperty(name)
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
