import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { formatMinutes } from '@/lib/utils'
import { useAuthStore } from '@/modules/auth/auth.store'
import { timerApi } from '@/modules/issues/api/collaboration.api'
import type { ActiveTimer } from '@/types/models'

function liveElapsedMinutes(startedAt: string, nowMs: number) {
  const start = new Date(startedAt).getTime()
  if (!Number.isFinite(start)) return 0
  return Math.max(1, Math.ceil((nowMs - start) / 60_000))
}

export const useTimerStore = defineStore('timer', () => {
  const auth = useAuthStore()
  const timer = ref<ActiveTimer | null>(null)
  const loading = ref(false)
  const acting = ref(false)
  const now = ref(Date.now())
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let started = false

  const isRunning = computed(() => Boolean(timer.value))
  const elapsedLabel = computed(() => {
    if (!timer.value) return ''
    return formatMinutes(liveElapsedMinutes(timer.value.startedAt, now.value))
  })
  const runningIssueId = computed(() => timer.value?.issueId ?? null)

  function ensureTick() {
    if (tickTimer || !timer.value) return
    tickTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }

  function stopTick() {
    if (!tickTimer) return
    clearInterval(tickTimer)
    tickTimer = null
  }

  watch(
    timer,
    (value) => {
      if (value) ensureTick()
      else stopTick()
    },
    { immediate: true },
  )

  async function refresh() {
    if (!auth.hasFeature('timeTracking')) {
      timer.value = null
      return
    }
    loading.value = true
    try {
      timer.value = await timerApi.get()
      now.value = Date.now()
    } catch {
      /* keep last known */
    } finally {
      loading.value = false
    }
  }

  function start() {
    if (started) return
    started = true
    void refresh()
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisible)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') void refresh()
  }

  async function startOnIssue(issueId: string, note?: string | null) {
    if (!auth.hasFeature('timeTracking')) return
    acting.value = true
    try {
      const result = await timerApi.start(issueId, note)
      timer.value = result.timer
      now.value = Date.now()
      if (result.stopped) {
        toast.success(`Logged ${formatMinutes(result.stopped.minutes)} on ${result.stopped.issueKey}`)
      }
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    } finally {
      acting.value = false
    }
  }

  async function stop(note?: string | null) {
    if (!timer.value) return null
    acting.value = true
    try {
      const result = await timerApi.stop(note)
      timer.value = null
      toast.success(`Logged ${formatMinutes(result.minutes)} on ${result.issueKey}`)
      return result
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    } finally {
      acting.value = false
    }
  }

  async function discard() {
    acting.value = true
    try {
      await timerApi.discard()
      timer.value = null
      toast.message('Timer discarded')
    } catch (error) {
      toast.error(getErrorMessage(error))
      throw error
    } finally {
      acting.value = false
    }
  }

  onScopeDispose(() => {
    stopTick()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible)
    }
  })

  return {
    timer,
    loading,
    acting,
    isRunning,
    elapsedLabel,
    runningIssueId,
    start,
    refresh,
    startOnIssue,
    stop,
    discard,
  }
})
