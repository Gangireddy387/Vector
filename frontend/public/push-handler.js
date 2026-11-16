/* Loaded into the service worker: shows Vector push notifications (calls, DMs, mentions, standups)
   and opens the right page when one is tapped, also when the app is closed. */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Vector', body: event.data ? event.data.text() : '' }
  }
  const kind = payload.kind || ''
  const isCall = kind === 'call'
  const isMessage = ['direct_message', 'chat_mention', 'channel_reply'].includes(kind)
  const isStandup = kind.startsWith('standup_')
  const url = payload.url
    ? `${payload.url}${isCall ? (payload.url.includes('?') ? '&' : '?') + 'join=1' : ''}`
    : '/'

  const actions = isCall
    ? [
        { action: 'join', title: 'Join' },
        { action: 'dismiss', title: 'Dismiss' },
      ]
    : isMessage || isStandup
      ? [{ action: 'open', title: 'Open' }]
      : []

  event.waitUntil(
    self.registration.showNotification(payload.title || 'Vector', {
      body: payload.body || '',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      requireInteraction: isCall,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      vibrate: isCall ? [400, 200, 400, 200, 400, 200, 400] : isStandup ? [180, 100, 180] : [200],
      data: { url, kind },
      actions,
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        if ('navigate' in open) return open.navigate(target)
        return undefined
      }
      return self.clients.openWindow(target)
    }),
  )
})
