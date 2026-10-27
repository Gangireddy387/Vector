import { useColorMode, useStorage } from '@vueuse/core'
import { computed } from 'vue'
import type { ColorMode } from '@/types/models'

export type ThemePreference = 'light' | 'dark' | 'auto'

export const THEME_STORAGE_KEY = 'vector.theme'
/** Set once the person picks light, dark or system themselves; until then they follow the organization's default. */
export const PERSONAL_THEME_STORAGE_KEY = 'vector.theme.personal'

export const toThemePreference = (mode: ColorMode): ThemePreference => (mode === 'system' ? 'auto' : mode)

/** Light / dark / system theme, saved per device. */
export function useTheme() {
  const mode = useColorMode({ storageKey: THEME_STORAGE_KEY, emitAuto: true, disableTransition: false })
  const isPersonal = useStorage(PERSONAL_THEME_STORAGE_KEY, false)

  /** Choosing a theme makes it this person's own: organization defaults no longer change it. */
  const preference = computed<ThemePreference>({
    get: () => mode.store.value as ThemePreference,
    set: (value) => {
      isPersonal.value = true
      mode.store.value = value
    },
  })
  const resolvedTheme = computed<'light' | 'dark'>(() => (mode.state.value === 'dark' ? 'dark' : 'light'))

  /** Applies the organization's default colour mode, unless the person picked their own. */
  function applyOrganizationDefault(defaultMode: ColorMode) {
    if (!isPersonal.value) mode.store.value = toThemePreference(defaultMode)
  }

  /** Drops the personal choice and goes back to following the organization's default. */
  function followOrganization(defaultMode: ColorMode) {
    isPersonal.value = false
    mode.store.value = toThemePreference(defaultMode)
  }

  return { preference, resolvedTheme, isPersonal, applyOrganizationDefault, followOrganization }
}
