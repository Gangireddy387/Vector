import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { UserSummary } from '@/types/models'
import { type MeetingContext, meetingsApi } from './meetings.api'

/** Who a "Meet" button calls: a department, team, project or one person. */
export interface MeetingPreset {
  title: string
  people: UserSummary[]
  context?: MeetingContext | null
}

const canSchedule = ref<boolean | null>(null)
let loading: Promise<void> | null = null
let loadedFor: string | null = null

/** Starting a meeting right away, and whether this person may schedule at all (asked once per organization). */
export function useMeetingActions() {
  const auth = useAuthStore()
  const router = useRouter()
  const startingKey = ref<string | null>(null)

  function loadPermission() {
    const organizationId = auth.organization?.id ?? null
    if (!auth.hasFeature('meetings') || !organizationId) {
      canSchedule.value = false
      return Promise.resolve()
    }
    if (loadedFor === organizationId && loading) return loading
    loadedFor = organizationId
    loading = meetingsApi
      .canSchedule()
      .then((value) => void (canSchedule.value = value))
      .catch(() => void (canSchedule.value = false))
    return loading
  }

  /** Creates a 30-minute meeting that starts now and opens its call. */
  async function meetNow(preset: MeetingPreset, key = preset.title) {
    const participantIds = [...new Set(preset.people.map((person) => person.id))].filter((id) => id !== auth.user?.id)
    if (!participantIds.length) {
      toast.error('There is no one else to invite yet')
      return
    }
    startingKey.value = key
    try {
      const meeting = await meetingsApi.create({
        title: preset.title,
        agenda: null,
        startsAt: new Date().toISOString(),
        durationMinutes: 30,
        participantIds,
        contextType: preset.context?.type ?? null,
        contextId: preset.context?.id ?? null,
      })
      toast.success('Meeting started', { description: `${participantIds.length} ${participantIds.length === 1 ? 'person was' : 'people were'} invited to join.` })
      await router.push({ name: 'meeting-room', params: { meetingId: meeting.id } })
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      startingKey.value = null
    }
  }

  return { canSchedule, loadPermission, meetNow, startingKey }
}
