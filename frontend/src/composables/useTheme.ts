import { useColorMode, useStorage } from '@vueuse/core'
import { computed } from 'vue'
import { isSuperAdminTab } from '@/lib/http'
import type { ColorMode } from '@/types/models'

/** `dim`: a softer, blue-grey dark theme (dark styles apply, with lighter surfaces). */
export type ThemePreference = 'light' | 'dim' | 'dark' | 'auto'

export const THEME_STORAGE_KEY = 'vector.theme'
/** Set once the person picks a theme themselves; until then they follow the organization's default. */
export const PERSONAL_THEME_STORAGE_KEY = 'vector.theme.personal'
/**
 * The super admin's tabs keep their own theme (see public/theme-init.js), so switching it there never changes what the
 * organization's tabs in the same browser look like, and the other way round.
 */
export const SUPER_ADMIN_THEME_STORAGE_KEY = 'vector.superAdmin.theme'

export const toThemePreference = (mode: ColorMode): ThemePreference => (mode === 'system' ? 'auto' : mode)

/** Light / dim / dark / system theme, saved per device. Dim adds the `dim` class on top of `dark`. */
export function useTheme() {
  const mode = useColorMode<'dim'>({
    storageKey: isSuperAdminTab() ? SUPER_ADMIN_THEME_STORAGE_KEY : THEME_STORAGE_KEY,
    emitAuto: true,
    disableTransition: false,
    modes: { dim: 'dark dim' },
  })
  const isPersonal = useStorage(PERSONAL_THEME_STORAGE_KEY, false)

  /** Choosing a theme makes it this person's own: organization defaults no longer change it. */
  const preference = computed<ThemePreference>({
    get: () => mode.store.value as ThemePreference,
    set: (value) => {
      isPersonal.value = true
      mode.store.value = value
    },
  })
  /** Light or dark for things that only know those two (toasts, the quick theme toggle); dim counts as dark. */
  const resolvedTheme = computed<'light' | 'dark'>(() => (mode.state.value === 'dark' || mode.state.value === 'dim' ? 'dark' : 'light'))

  /** Applies the organization's default colour mode, unless the person picked their own (the super admin has no organization). */
  function applyOrganizationDefault(defaultMode: ColorMode) {
    if (!isPersonal.value && !isSuperAdminTab()) mode.store.value = toThemePreference(defaultMode)
  }

  /** Drops the personal choice and goes back to following the organization's default. */
  function followOrganization(defaultMode: ColorMode) {
    isPersonal.value = false
    mode.store.value = toThemePreference(defaultMode)
  }

  return { preference, resolvedTheme, isPersonal, applyOrganizationDefault, followOrganization }
}
