import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getSocket } from '@/lib/realtime'
import { workspaceApi } from '@/modules/admin/admin.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { WorkspaceSettings } from '@/types/models'

const COLOR_MODE_KEY = 'vector.theme'

const FALLBACK: WorkspaceSettings = { name: 'Vector', defaultMode: 'system' }

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
    // First visit on this device: start from the organization's default colour mode.
    if (!localStorage.getItem(COLOR_MODE_KEY)) {
      localStorage.setItem(COLOR_MODE_KEY, settings.value.defaultMode === 'system' ? 'auto' : settings.value.defaultMode)
    }
  }

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
