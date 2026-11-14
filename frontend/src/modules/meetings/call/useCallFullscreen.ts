import { readonly, ref } from 'vue'

const active = ref(false)
const browserSupported = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)

if (typeof document !== 'undefined') {
  // Esc (or the browser's own "exit full screen") also brings the app's sidebar and top bar back.
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) active.value = false
  })
}

/**
 * The call takes the whole screen: the app's sidebar and top bars step aside, and the browser goes full screen
 * when it can. The whole page goes full screen (not just the call), so menus and dialogs still show above it.
 */
export function useCallFullscreen() {
  async function enter() {
    active.value = true
    if (browserSupported && !document.fullscreenElement) await document.documentElement.requestFullscreen().catch(() => undefined)
  }

  async function exit() {
    active.value = false
    if (typeof document !== 'undefined' && document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  }

  const toggle = () => (active.value ? exit() : enter())

  return { active: readonly(active), enter, exit, toggle }
}
