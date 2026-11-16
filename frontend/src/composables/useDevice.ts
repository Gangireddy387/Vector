import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Layout breakpoints (aligned with Tailwind defaults):
 * - phone:   < 768px  → MobileShell (tab bar)
 * - tablet:  768–1023 → DesktopShell with compact chrome
 * - desktop: ≥ 1024px → full workspace
 *
 * `isDesktop` means “workspace shell” (tablet + desktop). Use `isWide` when a
 * layout needs the full two-pane / side-rail density of a large screen.
 */
export function useDevice() {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isWide = useMediaQuery('(min-width: 1024px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
  const isPhone = computed(() => !isDesktop.value)
  /** @deprecated Prefer `isPhone` — kept so existing call sites keep working. */
  const isMobile = isPhone
  const isStandalone = useMediaQuery('(display-mode: standalone)')

  return { isDesktop, isWide, isTablet, isPhone, isMobile, isStandalone }
}
