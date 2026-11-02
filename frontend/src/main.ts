import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'vue-sonner'
import App from './App.vue'
import { setUnauthorizedHandler } from './lib/http'
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
    toast.error('Something went wrong on this page', { description: 'Try again; if it keeps happening, reload the page.' })
  }

  const auth = useAuthStore(pinia)
  setUnauthorizedHandler(() => void auth.logout(router.currentRoute.value.fullPath))
  const workspace = useWorkspaceStore(pinia)
  await Promise.all([auth.restoreSession(), workspace.load()])

  app.use(router)
  await router.isReady()
  app.mount('#app')

  // Earlier versions kept API answers in a cache; remove what they left behind.
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
}

void bootstrap()
