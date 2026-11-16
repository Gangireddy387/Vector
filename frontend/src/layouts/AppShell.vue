<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import DesktopShell from '@/components/layout/DesktopShell.vue'
import KeyboardShortcutsDialog from '@/components/layout/KeyboardShortcutsDialog.vue'
import MobileShell from '@/components/layout/MobileShell.vue'
import { useDevice } from '@/composables/useDevice'
import { useHotkeys } from '@/composables/useHotkeys'
import { useSoundPreferences } from '@/composables/useSoundPreferences'
import { useTimezoneSync } from '@/composables/useTimezoneSync'
import { setSoundGate } from '@/lib/sounds'
import { useAuthStore } from '@/modules/auth/auth.store'
import SetOwnPasswordDialog from '@/modules/auth/components/SetOwnPasswordDialog.vue'
import IssueCreateSheet from '@/modules/issues/components/IssueCreateSheet.vue'
import IssueDetailSheet from '@/modules/issues/components/IssueDetailSheet.vue'
import { useCallFullscreen } from '@/modules/meetings/call/useCallFullscreen'
import IncomingCall from '@/modules/meetings/components/IncomingCall.vue'
import MiniCall from '@/modules/meetings/components/MiniCall.vue'
import { useMessagesStore } from '@/modules/messages/messages.store'
import { useNotificationsStore } from '@/modules/notifications/notifications.store'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { usePresenceStore } from '@/stores/presence.store'
import { useUiStore } from '@/stores/ui.store'
import { useWorkspaceStore } from '@/stores/workspace.store'
import type { AppNotification } from '@/types/models'

const { isDesktop } = useDevice()
const route = useRoute()
const router = useRouter()
const ui = useUiStore()
const projects = useProjectsStore()
const notifications = useNotificationsStore()
const workspace = useWorkspaceStore()
const auth = useAuthStore()
const messages = useMessagesStore()
const presence = usePresenceStore()
const isShortcutsOpen = ref(false)
const callFullscreen = useCallFullscreen()
useTimezoneSync()

function openNotification(notification: AppNotification) {
  void notifications.openNotification(notification)
  if (notification.link) void router.push(notification.link)
}

// "Do not disturb" silences message and notification sounds.
setSoundGate(() => presence.chosen !== 'dnd')
useSoundPreferences()

onMounted(async () => {
  // Live updates first, so a failed load below never leaves the session without them.
  presence.start()
  notifications.bindRealtime(openNotification)
  workspace.bindRealtime()
  messages.bindRealtime()
  const results = await Promise.allSettled([projects.fetchProjects(), notifications.fetchNotifications(), messages.load()])
  if (results.some((result) => result.status === 'rejected')) {
    toast.error('Some of your workspace did not load', { description: 'Check your connection; it updates again once Vector is reachable.' })
  }
})

// The super admin can revoke an organization while people are using it.
watch(
  () => auth.isOrganizationBlocked,
  (blocked) => {
    if (blocked) void router.replace({ name: 'organization-pending' })
  },
)

const currentProjectId = () => (typeof route.params.projectId === 'string' ? route.params.projectId : undefined)
const openCreate = () => ui.openCreateIssue({ projectId: currentProjectId() })

watch(
  () => route.query.create,
  (value) => {
    if (value !== '1') return
    void router.replace({ query: { ...route.query, create: undefined } }).then(() => ui.openCreateIssue())
  },
  { immediate: true },
)

useHotkeys({
  'mod+k': () => isDesktop.value && (ui.isSearchOpen = true),
  '/': () => isDesktop.value && (ui.isSearchOpen = true),
  c: openCreate,
  '?': () => (isShortcutsOpen.value = true),
  'g h': () => router.push({ name: 'home' }),
  'g i': () => router.push({ name: 'inbox' }),
  'g p': () => router.push({ name: 'projects' }),
  'g a': () => router.push({ name: 'issues' }),
  'g r': () => router.push({ name: 'reports' }),
  'g o': () => currentProjectId() && router.push({ name: 'project-progress', params: { projectId: currentProjectId() } }),
  'g b': () => currentProjectId() && router.push({ name: 'project-board', params: { projectId: currentProjectId() } }),
  'g l': () => currentProjectId() && router.push({ name: 'project-backlog', params: { projectId: currentProjectId() } }),
})
</script>

<template>
  <DesktopShell v-if="isDesktop" :bare="callFullscreen.active.value" @show-shortcuts="isShortcutsOpen = true">
    <RouterView />
  </DesktopShell>
  <MobileShell v-else :bare="callFullscreen.active.value">
    <RouterView />
  </MobileShell>

  <IssueDetailSheet v-if="isDesktop" />
  <IssueCreateSheet v-if="isDesktop" />
  <KeyboardShortcutsDialog v-model:open="isShortcutsOpen" />
  <SetOwnPasswordDialog />
  <MiniCall variant="floating" />
  <IncomingCall v-if="auth.hasFeature('meetings')" />
</template>
