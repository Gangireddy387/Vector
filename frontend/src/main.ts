import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'vue-sonner'
import App from './App.vue'
import { isEmbedSession, isInIframe, markEmbedSession, setUnauthorizedHandler } from './lib/http'
import { useAuthStore } from './modules/auth/auth.store'
import { router } from './router'
import { useWorkspaceStore } from './stores/workspace.store'
import '@fontsource-variable/inter'
import './assets/styles/main.css'

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  // A bug in one component shows a message instead of a blank or frozen screen, and is logged for diagnosis.
  app.config.errorHandler = (error, _instance, info) => {
    console.error(`[app] ${info}:`, error)
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : null
    toast.error('Something went wrong on this page', {
      description: message ? `${message}${info ? ` (${info})` : ''}` : 'Try again; if it keeps happening, reload the page.',
    })
  }

  // Partner iframe: lock this context to sessionStorage before any restore/login runs.
  if (isInIframe() || isEmbedSession()) markEmbedSession()

  const auth = useAuthStore(pinia)
  setUnauthorizedHandler(() => {
    // Partner iframe: never bounce to the normal login page (that would also confuse session isolation).
    if (isEmbedSession()) void auth.logout('/embed?ended=1')
    else void auth.logout(router.currentRoute.value.fullPath)
  })
  const workspace = useWorkspaceStore(pinia)
  // Embed iframe / /embed boot must not restore the normal localStorage user.
  const skipRestore = isEmbedSession() && !auth.token
  await Promise.all([skipRestore ? Promise.resolve() : auth.restoreSession(), workspace.load()])

  app.use(router)
  await router.isReady()
  app.mount('#app')

  // Older builds used a broad `vector-api` cache; remove leftovers. Do not clear `vector-critical-get`
  // here — that short-lived NetworkFirst cache is what lets Home/Inbox reopen offline.
  if ('caches' in window) void caches.delete('vector-api').catch(() => false)

  const updateApp = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('A new version of Vector is ready', {
        description: 'Reload when it suits you; nothing is lost.',
        duration: Number.POSITIVE_INFINITY,
        action: { label: 'Reload', onClick: () => void updateApp(true) },
      })
    },
  })

  // Banner owns the offline status; only toast when coming back online.
  window.addEventListener('online', () => {
    toast.success('Back online', { id: 'network-status', description: 'Refreshing Home and Inbox…' })
  })
}

void bootstrap()
