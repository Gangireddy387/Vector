<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopShell from '@/components/layout/DesktopShell.vue'
import KeyboardShortcutsDialog from '@/components/layout/KeyboardShortcutsDialog.vue'
import MobileShell from '@/components/layout/MobileShell.vue'
import { useDevice } from '@/composables/useDevice'
import { useHotkeys } from '@/composables/useHotkeys'
import { useTimezoneSync } from '@/composables/useTimezoneSync'
import { useAuthStore } from '@/modules/auth/auth.store'
import IssueCreateSheet from '@/modules/issues/components/IssueCreateSheet.vue'
import IssueDetailSheet from '@/modules/issues/components/IssueDetailSheet.vue'
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
useTimezoneSync()

function openNotification(notification: AppNotification) {
  void notifications.markRead(notification)
  if (notification.link) void router.push(notification.link)
}

onMounted(async () => {
  presence.start()
  await Promise.all([projects.fetchProjects(), notifications.fetchNotifications(), messages.load().catch(() => undefined)])
  notifications.bindRealtime(openNotification)
  workspace.bindRealtime()
  messages.bindRealtime()
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
  <DesktopShell v-if="isDesktop" @show-shortcuts="isShortcutsOpen = true">
    <RouterView />
  </DesktopShell>
  <MobileShell v-else>
    <RouterView />
  </MobileShell>

  <IssueDetailSheet v-if="isDesktop" />
  <IssueCreateSheet v-if="isDesktop" />
  <KeyboardShortcutsDialog v-model:open="isShortcutsOpen" />
  <MiniCall variant="floating" />
  <IncomingCall v-if="auth.hasFeature('meetings')" />
</template>
