import { defineStore } from 'pinia'
import type { Socket } from 'socket.io-client'
import { ref } from 'vue'
import { timeAgo } from '@/lib/format'
import { type ChosenPresence, PRESENCE_LOOK, type PresenceStatus } from '@/lib/presence'
import { onSocketChange } from '@/lib/realtime'
import { useAuthStore } from '@/modules/auth/auth.store'

interface PresenceEntry {
  status: PresenceStatus
  lastSeenAt: string | null
}
type PresenceEvent = PresenceEntry & { userId: string; chosen?: ChosenPresence }

/** No mouse, keyboard or touch in any open tab for this long: shown as away. */
const IDLE_AFTER_MS = 5 * 60_000

/**
 * Everyone's availability, live. Components ask for the people they show (`statusOf`); their statuses are fetched in
 * one batch and then follow every change the server pushes, so nothing needs a reload.
 */
export const usePresenceStore = defineStore('presence', () => {
  const auth = useAuthStore()
  const entries = ref<Record<string, PresenceEntry>>({})
  /** What this person chose for themselves (null: automatic). */
  const chosen = ref<ChosenPresence>(null)
  /** Moves every 30 s so "last seen 5 minutes ago" stays current. */
  const tick = ref(Date.now())

  const tracked = new Set<string>()
  const pending = new Set<string>()
  let socket: Socket | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let idle = false
  let idleTimer: ReturnType<typeof setTimeout> | null = null
  let started = false

  function apply(userId: string, value: PresenceEntry & { chosen?: ChosenPresence }) {
    entries.value[userId] = { status: value.status, lastSeenAt: value.lastSeenAt }
    if (userId === auth.user?.id && value.chosen !== undefined) chosen.value = value.chosen
  }

  function flush() {
    flushTimer = null
    if (!socket?.connected || !pending.size) return
    const userIds = [...pending]
    pending.clear()
    socket.timeout(8000).emit('presence:query', { userIds }, (error: Error | null, result?: { ok: boolean; presence?: Record<string, PresenceEntry & { chosen?: ChosenPresence }> }) => {
      if (error || !result?.ok) return userIds.forEach((id) => pending.add(id))
      for (const [userId, value] of Object.entries(result.presence ?? {})) apply(userId, value)
    })
  }

  function track(userIds: Array<string | null | undefined>) {
    for (const id of userIds) {
      if (!id || tracked.has(id)) continue
      tracked.add(id)
      pending.add(id)
    }
    if (pending.size && !flushTimer) flushTimer = setTimeout(flush, 30)
  }

  const onChanged = (event: PresenceEvent) => apply(event.userId, event)

  /** After (re)connecting, statuses may have changed meanwhile: ask again for everyone shown. */
  function onConnect() {
    if (auth.user) tracked.add(auth.user.id)
    tracked.forEach((id) => pending.add(id))
    flush()
    if (idle) socket?.emit('presence:idle', { idle: true })
  }

  function bind(next: Socket | null, guest: boolean) {
    socket?.off('presence:changed', onChanged)
    socket?.off('connect', onConnect)
    socket = guest ? null : next
    if (!socket) return
    socket.on('presence:changed', onChanged)
    socket.on('connect', onConnect)
    if (socket.connected) onConnect()
  }

  function setIdle(next: boolean) {
    if (idle === next) return
    idle = next
    socket?.emit('presence:idle', { idle })
  }

  function onActivity() {
    setIdle(false)
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => setIdle(true), IDLE_AFTER_MS)
  }

  /** Follows the app's connection and this person's activity; call once when the app shell opens. */
  function start() {
    if (started) return
    started = true
    onSocketChange(bind)
    let last = 0
    const throttled = () => {
      const now = Date.now()
      if (now - last < 5000 && !idle) return
      last = now
      onActivity()
    }
    for (const event of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(event, throttled, { passive: true })
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && onActivity())
    onActivity()
    setInterval(() => (tick.value = Date.now()), 30_000)
  }

  /** The status of someone (null until known); asking also keeps them followed. */
  function statusOf(userId?: string | null): PresenceStatus | null {
    if (!userId) return null
    track([userId])
    return entries.value[userId]?.status ?? null
  }

  /** "Available", "In a call", "Offline · last seen 5 minutes ago"… */
  function describe(userId?: string | null) {
    const status = statusOf(userId)
    if (!status) return ''
    void tick.value
    const lastSeen = entries.value[userId!]?.lastSeenAt
    if (status === 'offline') return lastSeen ? `Offline · last seen ${timeAgo(lastSeen)}` : 'Offline'
    return PRESENCE_LOOK[status].label
  }

  /** Sets this person's own status for everyone (null: automatic again). */
  function choose(value: ChosenPresence) {
    return new Promise<void>((resolve, reject) => {
      if (!socket?.connected) return reject(new Error('Not connected. Check your connection and try again.'))
      socket.timeout(8000).emit('presence:choose', { status: value }, (error: Error | null, result?: { ok: boolean; error?: string; status: PresenceStatus; chosen: ChosenPresence }) => {
        if (error || !result?.ok) return reject(new Error(result?.error ?? 'Could not change your status'))
        chosen.value = result.chosen
        if (auth.user) entries.value[auth.user.id] = { status: result.status, lastSeenAt: entries.value[auth.user.id]?.lastSeenAt ?? null }
        resolve()
      })
    })
  }

  return { entries, chosen, start, track, statusOf, describe, choose }
})
