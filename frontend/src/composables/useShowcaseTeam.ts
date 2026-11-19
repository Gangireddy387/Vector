import { computed, onMounted, ref, type Ref } from 'vue'
import { TEAM, type Teammate } from '@/components/layout/team'
import { assetUrl, getStoredToken, http } from '@/lib/http'
import { connectPublicRealtime, connectRealtime, getSocket } from '@/lib/realtime'
import { bindSocketEvents } from '@/lib/socket-events'

export interface ShowcasePortrait {
  id: string
  name: string
  tone: string
  imageUrl: string
  sortOrder: number
}

const FALLBACK = Object.values(TEAM)
let cache: Ref<Teammate[]> | null = null
let loading: Promise<void> | null = null
let listening = false

function toTeammates(portraits: ShowcasePortrait[]): Teammate[] {
  return portraits.map((portrait) => ({
    name: portrait.name,
    tone: portrait.tone,
    src: assetUrl(portrait.imageUrl) ?? portrait.imageUrl,
  }))
}

function ensureCache() {
  if (!cache) cache = ref<Teammate[]>([...FALLBACK])
  return cache
}

function applyPortraits(portraits: ShowcasePortrait[]) {
  const list = ensureCache()
  list.value = portraits.length ? toTeammates(portraits) : [...FALLBACK]
}

async function fetchPortraits() {
  const { data } = await http.get<{ portraits: ShowcasePortrait[] }>('/showcase')
  return data.portraits
}

function ensureShowcaseSocket() {
  if (getSocket()?.connected) return
  if (getStoredToken()) connectRealtime()
  else connectPublicRealtime()
}

function listenForShowcaseUpdates() {
  if (listening) return
  listening = true
  // Module-level: keep listening across About / login / super-admin navigations.
  bindSocketEvents({
    'showcase:updated': (payload: { portraits?: ShowcasePortrait[] }) => {
      applyPortraits(payload?.portraits ?? [])
    },
  })
}

/** Uploaded showcase portraits for auth/marketing rich UI; falls back to built-in avatars. Live via Socket.IO. */
export function useShowcaseTeam() {
  const portraits = ensureCache()
  ensureShowcaseSocket()
  listenForShowcaseUpdates()

  onMounted(() => {
    ensureShowcaseSocket()
    if (loading) return
    loading = fetchPortraits()
      .then((list) => applyPortraits(list))
      .catch(() => {
        /* keep fallback */
      })
      .finally(() => {
        loading = null
      })
  })

  const community = computed(() => portraits.value.slice(0, 5))
  const byIndex = (index: number) => portraits.value[index % portraits.value.length] ?? FALLBACK[0]!

  return { portraits, community, byIndex, fallback: FALLBACK }
}

export async function reloadShowcaseTeam() {
  ensureCache()
  try {
    applyPortraits(await fetchPortraits())
  } catch {
    applyCacheFallback()
  }
}

function applyCacheFallback() {
  ensureCache().value = [...FALLBACK]
}
