import { useEventListener } from '@vueuse/core'
import { onMounted } from 'vue'
import { detectTimeZone } from '@/lib/timezone'
import { useAuthStore } from '@/modules/auth/auth.store'

/**
 * Keeps the signed-in user's time zone in step with their device (e.g. after travelling),
 * unless they chose a fixed zone in Settings. Runs on start and whenever the tab becomes visible again.
 */
export function useTimezoneSync() {
  const auth = useAuthStore()

  async function sync() {
    const user = auth.user
    if (!user || user.preferences.autoTimezone === false) return
    const detected = detectTimeZone()
    if (user.timezone === detected) return
    try {
      await auth.updateProfile({ timezone: detected })
    } catch {
      // Non-critical: the next visit tries again.
    }
  }

  onMounted(sync)
  useEventListener(document, 'visibilitychange', () => document.visibilityState === 'visible' && void sync())
}
