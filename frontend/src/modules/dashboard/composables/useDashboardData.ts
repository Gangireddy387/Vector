import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import { getErrorMessage } from '@/lib/http'
import { useSocketEvents } from '@/lib/socket-events'
import { useUiStore } from '@/stores/ui.store'
import { type DashboardData, dashboardApi } from '../dashboard.api'

/** Loads the personal dashboard and refreshes after local changes or new assignments. */
export function useDashboardData() {
  const data = ref<DashboardData | null>(null)
  const isLoading = ref(true)
  /** Why the dashboard could not load (shown with a retry button), or null. */
  const error = ref<string | null>(null)
  const { issuesVersion } = storeToRefs(useUiStore())

  async function load() {
    try {
      data.value = await dashboardApi.get()
      error.value = null
    } catch (problem) {
      error.value = getErrorMessage(problem)
    } finally {
      isLoading.value = false
    }
  }
  const refresh = useDebounceFn(load, 300)

  onMounted(() => void load())
  useSocketEvents({ 'notification:created': refresh })
  watch(issuesVersion, refresh)

  return { data, isLoading, error, reload: load }
}
