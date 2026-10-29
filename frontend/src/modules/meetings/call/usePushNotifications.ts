import { reactive } from 'vue'
import { http } from '@/lib/http'

const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
const isIos = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
const isInstalled = typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

const state = reactive({
  supported,
  /** iPhones and iPads only allow notifications for apps added to the Home Screen. */
  needsInstall: isIos && !isInstalled,
  permission: (supported ? Notification.permission : 'denied') as NotificationPermission,
  subscribed: false,
  busy: false,
})

function keyBytes(base64: string) {
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

/** The service worker is only there in the built app (and the installed app), not while developing. */
async function registration() {
  const found = await navigator.serviceWorker.getRegistration()
  if (found) return found
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Notifications need the installed app or the live site (not the development server).')), 4000)),
  ])
}

async function refresh() {
  if (!supported) return
  state.permission = Notification.permission
  const found = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  state.subscribed = Boolean(await found?.pushManager.getSubscription().catch(() => null))
}

async function enable() {
  if (!supported) throw new Error('This browser cannot show notifications.')
  if (state.needsInstall) throw new Error('First add Vector to your Home Screen (Share → Add to Home Screen), then open it from there.')
  state.busy = true
  try {
    state.permission = await Notification.requestPermission()
    if (state.permission !== 'granted') throw new Error('Notifications are blocked. Allow them in the browser’s site settings, then try again.')
    const worker = await registration()
    const { publicKey } = (await http.get<{ publicKey: string }>('/push/public-key')).data
    const subscription =
      (await worker.pushManager.getSubscription()) ?? (await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
    await http.post('/push/subscriptions', subscription.toJSON())
    state.subscribed = true
  } finally {
    state.busy = false
  }
}

async function disable() {
  state.busy = true
  try {
    const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
    if (subscription) {
      await http.delete('/push/subscriptions', { data: { endpoint: subscription.endpoint } }).catch(() => undefined)
      await subscription.unsubscribe()
    }
    state.subscribed = false
  } finally {
    state.busy = false
  }
}

/** This device rings for whoever is signed in now: after switching accounts the subscription moves with them. */
async function sync() {
  await refresh()
  if (!state.subscribed || state.permission !== 'granted') return
  const subscription = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (subscription) await http.post('/push/subscriptions', subscription.toJSON()).catch(() => undefined)
}

/** Calls ring on phones and computers through notifications, also when Vector is closed. */
export function usePushNotifications() {
  return { state, refresh, enable, disable, sync }
}
