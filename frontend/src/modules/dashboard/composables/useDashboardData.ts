import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { getSocket } from '@/lib/realtime'
import { useUiStore } from '@/stores/ui.store'
import { type DashboardData, dashboardApi } from '../dashboard.api'

/** Loads the personal dashboard and refreshes after local changes or new assignments. */
export function useDashboardData() {
  const data = ref<DashboardData | null>(null)
  const isLoading = ref(true)
  const { issuesVersion } = storeToRefs(useUiStore())

  async function load() {
    try {
      data.value = await dashboardApi.get()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      isLoading.value = false
    }
  }
  const refresh = useDebounceFn(load, 300)

  onMounted(() => {
    void load()
    getSocket()?.on('notification:created', refresh)
  })
  onBeforeUnmount(() => getSocket()?.off('notification:created', refresh))
  watch(issuesVersion, refresh)

  return { data, isLoading, reload: load }
}
