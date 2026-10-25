import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, type Ref, watch } from 'vue'
import { getSocket } from '@/lib/realtime'
import { useUiStore } from '@/stores/ui.store'

const PROJECT_EVENTS = ['issue:changed', 'comment:created', 'sprint:changed'] as const

/**
 * Joins the project's realtime room and calls `onChange` (debounced) whenever teammates,
 * automations or this client change issues, comments or sprints in that project.
 */
export function useProjectRealtime(projectId: Ref<string | null | undefined>, onChange: () => void) {
  const refresh = useDebounceFn(onChange, 300)
  const socket = getSocket()
  const { issuesVersion } = storeToRefs(useUiStore())

  const join = () => projectId.value && socket?.emit('project:join', projectId.value)

  watch(
    projectId,
    (id, previous) => {
      if (previous) socket?.emit('project:leave', previous)
      if (id) socket?.emit('project:join', id)
    },
    { immediate: true },
  )

  PROJECT_EVENTS.forEach((event) => socket?.on(event, refresh))
  socket?.on('connect', join)
  watch(issuesVersion, refresh)

  onBeforeUnmount(() => {
    PROJECT_EVENTS.forEach((event) => socket?.off(event, refresh))
    socket?.off('connect', join)
    if (projectId.value) socket?.emit('project:leave', projectId.value)
  })
}
