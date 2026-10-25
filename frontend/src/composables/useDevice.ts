import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'

/**
 * Single source of truth for the layout split.
 * Desktop (>= 1024px) gets the information-dense workspace; smaller screens get the task-focused mobile app.
 */
export function useDevice() {
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isMobile = computed(() => !isDesktop.value)
  const isStandalone = useMediaQuery('(display-mode: standalone)')
  return { isDesktop, isMobile, isStandalone }
}
