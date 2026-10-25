import { useColorMode } from '@vueuse/core'
import { computed } from 'vue'

export type ThemePreference = 'light' | 'dark' | 'auto'

/** Light / dark / system theme, persisted per device. */
export function useTheme() {
  const mode = useColorMode({ storageKey: 'vector.theme', emitAuto: true, disableTransition: false })
  const preference = computed<ThemePreference>({
    get: () => mode.store.value as ThemePreference,
    set: (value) => {
      mode.store.value = value
    },
  })
  const resolvedTheme = computed<'light' | 'dark'>(() => (mode.state.value === 'dark' ? 'dark' : 'light'))
  return { preference, resolvedTheme }
}
