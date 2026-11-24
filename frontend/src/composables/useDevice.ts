import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Single responsive contract for Vector (matches Tailwind defaults):
 *
 * | Token        | Width        | Use for                                      |
 * |--------------|--------------|----------------------------------------------|
 * | phone        | < 768px      | MobileShell (tab bar, full-page flows)       |
 * | desktop      | ≥ 768px      | DesktopShell (sidebar workspace chrome)      |
 * | wide         | ≥ 1024px     | Side sheets, two-pane / dense laptop layouts |
 * | table (xl)   | ≥ 1280px     | Dense data tables (`ResponsiveTable` default) |
 *
 * Tablet (768–1023) gets DesktopShell with compact chrome, but not side
 * panels — those need `isWide` (laptop/desktop density).
 *
 * Import the `*_MEDIA` / `matches*` helpers from Pinia or plain TS so JS
 * viewport checks never drift from this file.
 */
export const DESKTOP_MIN_WIDTH = 768
export const WIDE_MIN_WIDTH = 1024
/** Tailwind `xl` — dense tables switch from card list to `<table>`. */
export const TABLE_MIN_WIDTH = 1280

export const DESKTOP_MEDIA = `(min-width: ${DESKTOP_MIN_WIDTH}px)`
export const WIDE_MEDIA = `(min-width: ${WIDE_MIN_WIDTH}px)`
export const TABLE_MEDIA = `(min-width: ${TABLE_MIN_WIDTH}px)`
export const TABLET_MEDIA = `(min-width: ${DESKTOP_MIN_WIDTH}px) and (max-width: ${WIDE_MIN_WIDTH - 1}px)`

export function matchesDesktopViewport() {
  return typeof window !== 'undefined' && window.matchMedia(DESKTOP_MEDIA).matches
}

/** Side panels / two-pane density (laptop & desktop). */
export function matchesWideViewport() {
  return typeof window !== 'undefined' && window.matchMedia(WIDE_MEDIA).matches
}

/** Dense data tables (`ResponsiveTable` default). */
export function matchesTableViewport() {
  return typeof window !== 'undefined' && window.matchMedia(TABLE_MEDIA).matches
}

export function useDevice() {
  const isDesktop = useMediaQuery(DESKTOP_MEDIA)
  const isWide = useMediaQuery(WIDE_MEDIA)
  const isTablet = useMediaQuery(TABLET_MEDIA)
  /** Dense `<table>` layouts — prefer CSS via `ResponsiveTable` when possible. */
  const isTable = useMediaQuery(TABLE_MEDIA)
  const isPhone = computed(() => !isDesktop.value)
  /** @deprecated Prefer `isPhone` — kept so existing call sites keep working. */
  const isMobile = isPhone
  const isStandalone = useMediaQuery('(display-mode: standalone)')

  return { isDesktop, isWide, isTablet, isTable, isPhone, isMobile, isStandalone }
}
