import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, type Ref, watch } from 'vue'
import { getSocket, onSocketChange } from '@/lib/realtime'
import { useSocketEvents } from '@/lib/socket-events'
import { useUiStore } from '@/stores/ui.store'

const PROJECT_EVENTS = ['issue:changed', 'comment:created', 'sprint:changed'] as const

/**
 * Several views can follow the same project at once (the board and the task panel over it). The browser stays in a
 * project's live room while at least one of them needs it, and rejoins every needed room after reconnecting.
 */
const roomUsers = new Map<string, number>()
let followingConnection = false

function ensureRejoining() {
  if (followingConnection) return
  followingConnection = true
  onSocketChange((socket) => {
    if (!socket) return
    const rejoin = () => roomUsers.forEach((_count, projectId) => socket.emit('project:join', projectId))
    socket.on('connect', rejoin)
    if (socket.connected) rejoin()
  })
}

export function enterRoom(projectId: string) {
  ensureRejoining()
  const count = (roomUsers.get(projectId) ?? 0) + 1
  roomUsers.set(projectId, count)
  if (count === 1) getSocket()?.emit('project:join', projectId)
}

export function leaveRoom(projectId: string) {
  const count = (roomUsers.get(projectId) ?? 1) - 1
  if (count > 0) return roomUsers.set(projectId, count)
  roomUsers.delete(projectId)
  getSocket()?.emit('project:leave', projectId)
}

/**
 * Follows a project live and calls `onChange` (debounced) whenever teammates, automations or this client change its
 * issues, comments or sprints. Events about other projects are ignored.
 */
export function useProjectRealtime(projectId: Ref<string | null | undefined>, onChange: () => void) {
  const refresh = useDebounceFn(onChange, 300)
  const { issuesVersion } = storeToRefs(useUiStore())

  watch(
    projectId,
    (id, previous) => {
      if (previous) leaveRoom(previous)
      if (id) enterRoom(id)
    },
    { immediate: true },
  )

  const forThisProject = (payload?: { projectId?: string }) => {
    if (!payload?.projectId || payload.projectId === projectId.value) void refresh()
  }
  useSocketEvents(Object.fromEntries(PROJECT_EVENTS.map((event) => [event, forThisProject])))
  watch(issuesVersion, refresh)

  onBeforeUnmount(() => {
    if (projectId.value) leaveRoom(projectId.value)
  })
}
