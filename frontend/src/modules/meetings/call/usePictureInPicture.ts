import { shallowRef } from 'vue'

interface DocumentPictureInPicture {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>
  window: Window | null
}
const documentPip = () => (window as Window & { documentPictureInPicture?: DocumentPictureInPicture }).documentPictureInPicture

const pipWindow = shallowRef<Window | null>(null)
const pipBody = shallowRef<HTMLElement | null>(null)

/** The pop-out window gets the app's styles and theme, so the call looks the same in it. */
function copyStyles(target: Document) {
  for (const sheet of [...document.styleSheets]) {
    try {
      const style = target.createElement('style')
      style.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join('\n')
      target.head.append(style)
    } catch {
      if (!sheet.href) continue
      const link = target.createElement('link')
      link.rel = 'stylesheet'
      link.href = sheet.href
      target.head.append(link)
    }
  }
  target.documentElement.className = document.documentElement.className
  target.documentElement.style.cssText = document.documentElement.style.cssText
}

/**
 * Keeps the call visible over other windows and apps. Chrome and Edge pop out the whole small call window (with its
 * buttons); other browsers pop out one video.
 */
export function usePictureInPicture() {
  const supported = typeof window !== 'undefined' && (Boolean(documentPip()) || Boolean(document.pictureInPictureEnabled))

  async function open(tileId?: string | null) {
    if (pipWindow.value) return
    const api = documentPip()
    if (api) {
      const popup = await api.requestWindow({ width: 340, height: 300 })
      copyStyles(popup.document)
      popup.document.body.className = 'm-0 h-screen overflow-hidden bg-[#0d1017] text-white'
      const mount = popup.document.createElement('div')
      mount.className = 'h-full'
      popup.document.body.append(mount)
      popup.addEventListener('pagehide', () => {
        pipWindow.value = null
        pipBody.value = null
      })
      pipWindow.value = popup
      pipBody.value = mount
      return
    }
    const video =
      document.querySelector<HTMLVideoElement>(`[data-tile-id="${tileId ?? ''}"] video`) ??
      document.querySelector<HTMLVideoElement>('[data-tile-id]:not([data-tile-id="self"]) video') ??
      document.querySelector<HTMLVideoElement>('[data-tile-id] video')
    if (!video || !document.pictureInPictureEnabled) throw new Error('This browser cannot pop the call out. Use Chrome or Edge.')
    await video.requestPictureInPicture()
  }

  function close() {
    pipWindow.value?.close()
    pipWindow.value = null
    pipBody.value = null
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => undefined)
  }

  return { supported, pipWindow, pipBody, open, close }
}
