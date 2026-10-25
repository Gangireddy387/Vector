import { useEventListener } from '@vueuse/core'

type HotkeyMap = Record<string, (event: KeyboardEvent) => void>

const isTypingTarget = (target: EventTarget | null) => {
  const element = target as HTMLElement | null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
}

/**
 * Registers keyboard shortcuts. Keys use the format "mod+k", "c", "g b" (sequence) or "?".
 * Plain keys are ignored while the user is typing in a field or a dialog is open.
 */
export function useHotkeys(bindings: HotkeyMap) {
  let pending: string | null = null
  let pendingTimer: ReturnType<typeof setTimeout> | undefined

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    const hasModifier = event.metaKey || event.ctrlKey

    if (hasModifier) {
      const handler = bindings[`mod+${key}`]
      if (handler) {
        event.preventDefault()
        handler(event)
      }
      return
    }
    if (event.altKey || isTypingTarget(event.target)) return

    if (pending) {
      const handler = bindings[`${pending} ${key}`]
      pending = null
      clearTimeout(pendingTimer)
      if (handler) {
        event.preventDefault()
        handler(event)
        return
      }
    }

    if (Object.keys(bindings).some((combo) => combo.startsWith(`${key} `))) {
      pending = key
      pendingTimer = setTimeout(() => (pending = null), 800)
      return
    }

    const handler = bindings[event.key === '?' ? '?' : key]
    if (handler) {
      event.preventDefault()
      handler(event)
    }
  })
}
