import { parseSticker } from '@/lib/emoji-stickers'

/** Full-screen send effects (WhatsApp / Google Messages style). */
export type SendEffectKind = 'confetti' | 'hearts' | 'announce' | 'ship' | 'fire' | 'sparkle' | 'balloons'

const CELEBRATE_EMOJI = new Set(['🎉', '🎊', '🥳', '🎈', '🎂', '🎁', '🍾', '🥂', '🏆', '🥇', '🎖️', '👑', '✨', '💫', '🌟', '🎆', '🎇', '🪅'])
const HEART_EMOJI = new Set(['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖', '💗', '💘'])
const ANNOUNCE_EMOJI = new Set(['📢', '📣', '🔔', '🚨', '🆕', '🆙', '🗞️', '🎺', '💥'])
const SHIP_EMOJI = new Set(['🚀', '✈️', '🛰️'])
const FIRE_EMOJI = new Set(['🔥', '💥', '⚡'])

export interface SendEffectPayload {
  kind: SendEffectKind
  emoji?: string
}

type Listener = (payload: SendEffectPayload) => void
const listeners = new Set<Listener>()

export function onSendEffect(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function playSendEffect(payload: SendEffectPayload | null | undefined) {
  if (!payload?.kind) return
  for (const listener of listeners) listener(payload)
}

/** Map a sticker token or plain emoji-only body to a send effect. */
export function sendEffectForBody(body: string | null | undefined): SendEffectPayload | null {
  if (!body) return null
  const trimmed = body.trim()
  const sticker = parseSticker(trimmed)
  if (sticker) {
    if (sticker.pack === 'celebrate') {
      if (sticker.id === 'balloon' || sticker.id === 'balloons') return { kind: 'balloons', emoji: sticker.emoji }
      if (sticker.id === 'heart' || sticker.emoji === '❤️') return { kind: 'hearts', emoji: sticker.emoji }
      return { kind: 'confetti', emoji: sticker.emoji }
    }
    if (sticker.pack === 'announce') return { kind: 'announce', emoji: sticker.emoji }
    if (sticker.id === 'rocket' || sticker.id === 'ship') return { kind: 'ship', emoji: sticker.emoji }
    if (sticker.id === 'fire' || sticker.id === 'sparkle') return { kind: sticker.id === 'fire' ? 'fire' : 'sparkle', emoji: sticker.emoji }
    if (sticker.id === 'heart') return { kind: 'hearts', emoji: sticker.emoji }
    if (sticker.pack === 'work' && (sticker.id === 'star' || sticker.id === 'hundred' || sticker.id === 'check')) {
      return { kind: 'sparkle', emoji: sticker.emoji }
    }
    return null
  }

  // Plain emoji-only message (like WhatsApp screen effects).
  if (CELEBRATE_EMOJI.has(trimmed)) return { kind: 'confetti', emoji: trimmed }
  if (HEART_EMOJI.has(trimmed)) return { kind: 'hearts', emoji: trimmed }
  if (ANNOUNCE_EMOJI.has(trimmed)) return { kind: 'announce', emoji: trimmed }
  if (SHIP_EMOJI.has(trimmed)) return { kind: 'ship', emoji: trimmed }
  if (FIRE_EMOJI.has(trimmed)) return { kind: 'fire', emoji: trimmed }
  return null
}
