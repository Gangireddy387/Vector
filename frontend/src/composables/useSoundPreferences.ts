import { watch } from 'vue'
import { applySoundPreferences } from '@/lib/sounds'
import { useAuthStore } from '@/modules/auth/auth.store'

/** Keeps the sounds that play in step with the person's saved choices and whether their organization's plan allows them. */
export function useSoundPreferences() {
  const auth = useAuthStore()
  watch(
    () => [auth.user?.preferences?.sounds, auth.hasFeature('customSounds')] as const,
    ([saved, allowed]) => applySoundPreferences(saved, allowed),
    { immediate: true, deep: true },
  )
}
