import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { registerSW } from 'virtual:pwa-register'
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

  const auth = useAuthStore(pinia)
  setUnauthorizedHandler(() => void auth.logout(router.currentRoute.value.fullPath))
  const workspace = useWorkspaceStore(pinia)
  await Promise.all([auth.restoreSession(), workspace.load()])

  app.use(router)
  await router.isReady()
  app.mount('#app')

  registerSW({ immediate: true })
}

void bootstrap()
