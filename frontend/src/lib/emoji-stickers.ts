/** Shared emoji + sticker catalogs for Teams channels, DMs, and project chat. */

export const EMOJI_CATEGORIES: Array<{ id: string; label: string; emojis: string[] }> = [
  {
    id: 'smileys',
    label: 'Smileys',
    emojis: ['😀', '😄', '😂', '🤣', '🙂', '😉', '😊', '😍', '🥰', '😘', '🤩', '🤔', '🤨', '😐', '😮', '😯', '😢', '😭', '😅', '😤', '😡', '🤯', '🥶', '🥳'],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤝', '👏', '🙌', '👐', '💪', '🙏', '👋', '👆', '👇', '👈', '👉', '👀', '🧠', '💬', '💭'],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '✨', '⭐', '🔥', '🎉', '🎊', '✅', '❌', '⚠️', '🚀', '💡', '📌', '📎', '☕'],
  },
]

/** Flat list used by legacy pickers / search. */
export const EMOJIS = EMOJI_CATEGORIES.flatMap((category) => category.emojis)

export type StickerTone = 'sky' | 'rose' | 'amber' | 'violet' | 'emerald' | 'orange' | 'slate' | 'pink'

/** Looping motion applied to the sticker glyph. */
export type StickerMotion = 'wave' | 'bounce' | 'pulse' | 'spin' | 'float' | 'shake' | 'wiggle' | 'pop' | 'heartbeat' | 'flicker'

export interface Sticker {
  id: string
  emoji: string
  label: string
  tone: StickerTone
  motion: StickerMotion
}

/**
 * Stickers are message attachments, not typed characters.
 * Body uses `[[sticker:id]]` so they never collide with inline emoji.
 */
export const STICKERS: Sticker[] = [
  { id: 'wave', emoji: '👋', label: 'Wave', tone: 'sky', motion: 'wave' },
  { id: 'thumbs', emoji: '👍', label: 'Thumbs up', tone: 'emerald', motion: 'bounce' },
  { id: 'clap', emoji: '👏', label: 'Clap', tone: 'amber', motion: 'shake' },
  { id: 'party', emoji: '🥳', label: 'Party', tone: 'pink', motion: 'wiggle' },
  { id: 'tada', emoji: '🎉', label: 'Celebrate', tone: 'violet', motion: 'pop' },
  { id: 'fire', emoji: '🔥', label: 'Fire', tone: 'orange', motion: 'flicker' },
  { id: 'heart', emoji: '❤️', label: 'Love', tone: 'rose', motion: 'heartbeat' },
  { id: 'laugh', emoji: '😂', label: 'LOL', tone: 'amber', motion: 'shake' },
  { id: 'think', emoji: '🤔', label: 'Thinking', tone: 'slate', motion: 'float' },
  { id: 'wow', emoji: '😮', label: 'Wow', tone: 'sky', motion: 'pulse' },
  { id: 'cry', emoji: '😢', label: 'Sad', tone: 'sky', motion: 'float' },
  { id: 'pray', emoji: '🙏', label: 'Thanks', tone: 'violet', motion: 'pulse' },
  { id: 'muscle', emoji: '💪', label: 'Strong', tone: 'orange', motion: 'bounce' },
  { id: 'rocket', emoji: '🚀', label: 'Ship it', tone: 'slate', motion: 'float' },
  { id: 'eyes', emoji: '👀', label: 'Eyes', tone: 'emerald', motion: 'wiggle' },
  { id: 'ok', emoji: '👌', label: 'OK', tone: 'emerald', motion: 'pop' },
  { id: 'star', emoji: '⭐', label: 'Star', tone: 'amber', motion: 'spin' },
  { id: 'check', emoji: '✅', label: 'Done', tone: 'emerald', motion: 'bounce' },
  { id: 'coffee', emoji: '☕', label: 'Coffee', tone: 'orange', motion: 'float' },
  { id: 'idea', emoji: '💡', label: 'Idea', tone: 'amber', motion: 'flicker' },
]

const STICKER_TOKEN = /^\[\[sticker:([a-z0-9_-]+)\]\]$/i
const stickerById = new Map(STICKERS.map((item) => [item.id, item]))

export const STICKER_TONE_CLASS: Record<StickerTone, string> = {
  sky: 'from-sky-100 to-sky-200/80 dark:from-sky-500/25 dark:to-sky-700/20',
  rose: 'from-rose-100 to-rose-200/80 dark:from-rose-500/25 dark:to-rose-700/20',
  amber: 'from-amber-100 to-amber-200/80 dark:from-amber-500/25 dark:to-amber-700/20',
  violet: 'from-violet-100 to-violet-200/80 dark:from-violet-500/25 dark:to-violet-700/20',
  emerald: 'from-emerald-100 to-emerald-200/80 dark:from-emerald-500/25 dark:to-emerald-700/20',
  orange: 'from-orange-100 to-orange-200/80 dark:from-orange-500/25 dark:to-orange-700/20',
  slate: 'from-slate-100 to-slate-200/80 dark:from-slate-500/25 dark:to-slate-700/20',
  pink: 'from-pink-100 to-fuchsia-200/80 dark:from-pink-500/25 dark:to-fuchsia-700/20',
}

export const STICKER_MOTION_CLASS: Record<StickerMotion, string> = {
  wave: 'sticker-motion-wave',
  bounce: 'sticker-motion-bounce',
  pulse: 'sticker-motion-pulse',
  spin: 'sticker-motion-spin',
  float: 'sticker-motion-float',
  shake: 'sticker-motion-shake',
  wiggle: 'sticker-motion-wiggle',
  pop: 'sticker-motion-pop',
  heartbeat: 'sticker-motion-heartbeat',
  flicker: 'sticker-motion-flicker',
}

/** Encode a sticker id into the message body token. */
export function encodeSticker(id: string): string {
  return `[[sticker:${id}]]`
}

export function parseSticker(body: string | null | undefined): Sticker | null {
  if (!body) return null
  const match = STICKER_TOKEN.exec(body.trim())
  if (!match) return null
  return stickerById.get(match[1]!.toLowerCase()) ?? null
}

/** True when the whole message is a sticker token (not plain emoji text). */
export function isStickerMessage(body: string | null | undefined): boolean {
  return parseSticker(body) !== null
}
