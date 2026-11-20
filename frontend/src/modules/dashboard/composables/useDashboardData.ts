import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { onCriticalRetry } from '@/lib/pwa-caches'
import { useSocketEvents } from '@/lib/socket-events'
import { useUiStore } from '@/stores/ui.store'
import { type DashboardData, dashboardApi } from '../dashboard.api'

/** Loads the personal dashboard and refreshes after local changes, reconnect, or Retry. */
export function useDashboardData() {
  const data = ref<DashboardData | null>(null)
  const isLoading = ref(true)
  /** Why the dashboard could not load (shown with a retry button), or null. */
  const error = ref<string | null>(null)
  /** True when the last successful payload came from cache / a previous visit while offline. */
  const isStale = ref(false)
  const { issuesVersion } = storeToRefs(useUiStore())

  async function load() {
    const hadData = Boolean(data.value)
    if (!hadData) isLoading.value = true
    try {
      const payload = await dashboardApi.get()
      data.value = {
        ...payload,
        standupPending: payload.standupPending ?? [],
        meetingActions: payload.meetingActions ?? [],
        standupRollup: payload.standupRollup ?? [],
      }
      error.value = null
      isStale.value = !navigator.onLine
    } catch (problem) {
      const message = getErrorMessage(problem)
      error.value = message
      if (hadData) {
        isStale.value = true
        toast.error('Could not refresh Home', { description: message })
      }
    } finally {
      isLoading.value = false
    }
  }
  const refresh = useDebounceFn(load, 300)

  onMounted(() => void load())
  const stopRetry = onCriticalRetry(() => void load())
  onUnmounted(stopRetry)
  useSocketEvents({ 'notification:created': refresh })
  watch(issuesVersion, refresh)

  return { data, isLoading, error, isStale, reload: load }
}
