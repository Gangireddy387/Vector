/**
 * Keyboard shortcuts while in a call (like Teams and Google Meet). All of them use a modifier, so they also work
 * while typing in the chat; keys are matched by position (`code`), so they work with any keyboard layout and with
 * Alt / Option held on a Mac.
 */

export type CallShortcutAction =
  | 'mute'
  | 'camera'
  | 'share'
  | 'hand'
  | 'chat'
  | 'people'
  | 'qa'
  | 'assistant'
  | 'whiteboard'
  | 'leave'
  | 'talk'

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘' : 'Ctrl'
const ALT = isMac ? '⌥' : 'Alt'

interface CallShortcut {
  action: CallShortcutAction
  label: string
  /** Keys as shown to people. */
  combo: string[]
  code: string
  mod: boolean
  shift: boolean
  alt: boolean
}

const shortcut = (action: CallShortcutAction, label: string, code: string, { mod = true, shift = false, alt = false } = {}): CallShortcut => ({
  action,
  label,
  code,
  mod,
  shift,
  alt,
  combo: [...(mod ? [MOD] : []), ...(shift ? ['Shift'] : []), ...(alt ? [ALT] : []), code.replace(/^Key/, '')],
})

export const CALL_SHORTCUTS: CallShortcut[] = [
  shortcut('mute', 'Mute or unmute', 'KeyD'),
  shortcut('camera', 'Turn your camera on or off', 'KeyE'),
  shortcut('share', 'Share your screen or stop', 'KeyE', { shift: true }),
  shortcut('hand', 'Raise or lower your hand', 'KeyH', { alt: true }),
  shortcut('chat', 'Open the chat', 'KeyC', { alt: true }),
  shortcut('people', 'Open people', 'KeyP', { alt: true }),
  shortcut('qa', 'Open Q&A', 'KeyQ', { alt: true }),
  shortcut('assistant', 'Ask the AI assistant', 'KeyA', { alt: true }),
  shortcut('whiteboard', 'Open or close the whiteboard', 'KeyW', { alt: true }),
  shortcut('leave', 'Leave the call', 'KeyH', { shift: true }),
]

/** Hold to talk while muted: Ctrl + Space (Option + Space on a Mac, where ⌘ + Space opens Spotlight). */
export const TALK_SHORTCUT = { label: 'Hold to talk while muted', combo: isMac ? [ALT, 'Space'] : ['Ctrl', 'Space'] }
export const isTalkKey = (event: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>) =>
  event.code === 'Space' && !event.shiftKey && !event.metaKey && (isMac ? event.altKey && !event.ctrlKey : event.ctrlKey && !event.altKey)

type KeyInfo = Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>

/** The call action for this key press, if any. */
export function callShortcutFor(event: KeyInfo, mac = isMac): CallShortcutAction | null {
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  if (!mod) return null
  const found = CALL_SHORTCUTS.find((item) => item.code === event.code && item.shift === event.shiftKey && item.alt === event.altKey)
  return found?.action ?? null
}
