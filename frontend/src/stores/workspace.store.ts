import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { PERSONAL_THEME_STORAGE_KEY, THEME_STORAGE_KEY, toThemePreference, useTheme } from '@/composables/useTheme'
import { getSocket } from '@/lib/realtime'
import { workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { WorkspaceSettings } from '@/types/models'

const FALLBACK: WorkspaceSettings = { name: 'Vector', defaultMode: 'system' }

/**
 * Devices from before personal themes were tracked: a saved theme that differs from the organization's default was
 * picked by the person, so it stays theirs. Read before anything writes the new key.
 */
const legacyTheme = localStorage.getItem(PERSONAL_THEME_STORAGE_KEY) === null ? localStorage.getItem(THEME_STORAGE_KEY) : null

/** The current organization's name, address and default colour mode (Vector's own branding when signed out). */
export const useWorkspaceStore = defineStore('workspace', () => {
  const branding = ref<WorkspaceSettings>({ ...FALLBACK })
  const auth = useAuthStore()
  let isBound = false

  const settings = computed<WorkspaceSettings>(() =>
    auth.organization
      ? {
          name: auth.organization.name,
          slug: auth.organization.slug,
          defaultMode: auth.organization.defaultMode,
          logoUrl: auth.organization.logoUrl ?? null,
          updatedAt: auth.organization.updatedAt,
        }
      : branding.value,
  )
  const isAdmin = computed(() => auth.isOrganizationAdmin)

  async function load() {
    try {
      branding.value = await workspaceApi.get()
    } catch {
      branding.value = { ...FALLBACK }
    }
  }

  /** Everyone who has not picked their own theme follows the organization's default, also when an admin changes it. */
  const theme = useTheme()
  let migrated = legacyTheme === null
  watch(
    () => auth.organization?.defaultMode,
    (defaultMode) => {
      if (!defaultMode) return
      if (!migrated) {
        theme.isPersonal.value = Boolean(legacyTheme) && legacyTheme !== toThemePreference(defaultMode)
        migrated = true
      }
      theme.applyOrganizationDefault(defaultMode)
    },
    { immediate: true },
  )

  async function update(changes: Partial<Omit<WorkspaceSettings, 'updatedAt'>>) {
    const current = settings.value as unknown as Record<string, unknown>
    const changed = Object.fromEntries(Object.entries(changes).filter(([key, value]) => current[key] !== value))
    if (!Object.keys(changed).length) return
    auth.patchOrganization(await workspaceApi.update(changed))
  }

  async function uploadLogo(image: Blob, fileName: string) {
    auth.patchOrganization(await workspaceApi.uploadLogo(image, fileName))
  }

  async function removeLogo() {
    auth.patchOrganization(await workspaceApi.removeLogo())
  }

  /** Admin changes reach every open browser of the organization's members instantly. */
  function bindRealtime() {
    const socket = getSocket()
    if (!socket || isBound) return
    isBound = true
    socket.on('workspace:updated', (next: WorkspaceSettings & { id?: string }) => auth.patchOrganization(next))
  }

  return { settings, isAdmin, load, update, uploadLogo, removeLogo, bindRealtime }
})
