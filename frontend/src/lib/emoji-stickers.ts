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
    id: 'celebrate',
    label: 'Celebrate',
    emojis: ['🎉', '🎊', '🥳', '🎈', '🎂', '🎁', '🍾', '🥂', '🏆', '🥇', '🎖️', '👑', '✨', '💫', '🌟', '🎆', '🎇', '🪅'],
  },
  {
    id: 'announce',
    label: 'Announce',
    emojis: ['📢', '📣', '🔔', '🗞️', '📰', '📌', '📍', '🚩', '🚨', '⚠️', '❗', '❕', '🆕', '🆙', '🆓', '🆘'],
  },
  {
    id: 'work',
    label: 'Work',
    emojis: ['🚀', '💡', '✅', '❌', '📝', '📊', '📈', '📉', '🎯', '🗓️', '⏰', '💼', '🖥️', '⌨️', '🗂️', '📎', '🔗', '🛠️'],
  },
  {
    id: 'symbols',
    label: 'Symbols',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '⭐', '🔥', '☕', '🌈', '☀️', '🌙', '⚡'],
  },
]

/** Flat list used by legacy pickers / search. */
export const EMOJIS = EMOJI_CATEGORIES.flatMap((category) => category.emojis)

export type StickerTone = 'sky' | 'rose' | 'amber' | 'violet' | 'emerald' | 'orange' | 'slate' | 'pink' | 'gold' | 'red'

/** Looping motion applied to the sticker glyph. */
export type StickerMotion = 'wave' | 'bounce' | 'pulse' | 'spin' | 'float' | 'shake' | 'wiggle' | 'pop' | 'heartbeat' | 'flicker' | 'blast' | 'ring'

export type StickerPack = 'reactions' | 'celebrate' | 'announce' | 'work'

export interface Sticker {
  id: string
  emoji: string
  label: string
  tone: StickerTone
  motion: StickerMotion
  pack: StickerPack
}

export const STICKER_PACKS: Array<{ id: StickerPack; label: string; hint: string }> = [
  { id: 'reactions', label: 'Reactions', hint: 'Everyday vibes' },
  { id: 'celebrate', label: 'Celebrate', hint: 'Wins, parties, shout-outs' },
  { id: 'announce', label: 'Announce', hint: 'News, alerts, launches' },
  { id: 'work', label: 'Work', hint: 'Ship, focus, deadlines' },
]

/**
 * Stickers are message attachments, not typed characters.
 * Body uses `[[sticker:id]]` so they never collide with inline emoji.
 */
export const STICKERS: Sticker[] = [
  // Reactions
  { id: 'wave', emoji: '👋', label: 'Wave', tone: 'sky', motion: 'wave', pack: 'reactions' },
  { id: 'thumbs', emoji: '👍', label: 'Thumbs up', tone: 'emerald', motion: 'bounce', pack: 'reactions' },
  { id: 'clap', emoji: '👏', label: 'Clap', tone: 'amber', motion: 'shake', pack: 'reactions' },
  { id: 'heart', emoji: '❤️', label: 'Love', tone: 'rose', motion: 'heartbeat', pack: 'reactions' },
  { id: 'laugh', emoji: '😂', label: 'LOL', tone: 'amber', motion: 'shake', pack: 'reactions' },
  { id: 'think', emoji: '🤔', label: 'Thinking', tone: 'slate', motion: 'float', pack: 'reactions' },
  { id: 'wow', emoji: '😮', label: 'Wow', tone: 'sky', motion: 'pulse', pack: 'reactions' },
  { id: 'cry', emoji: '😢', label: 'Sad', tone: 'sky', motion: 'float', pack: 'reactions' },
  { id: 'pray', emoji: '🙏', label: 'Thanks', tone: 'violet', motion: 'pulse', pack: 'reactions' },
  { id: 'eyes', emoji: '👀', label: 'Eyes', tone: 'emerald', motion: 'wiggle', pack: 'reactions' },
  { id: 'ok', emoji: '👌', label: 'OK', tone: 'emerald', motion: 'pop', pack: 'reactions' },
  { id: 'muscle', emoji: '💪', label: 'Strong', tone: 'orange', motion: 'bounce', pack: 'reactions' },

  // Celebrate — distinct for wins / parties
  { id: 'party', emoji: '🥳', label: 'Party', tone: 'pink', motion: 'wiggle', pack: 'celebrate' },
  { id: 'tada', emoji: '🎉', label: 'Celebrate', tone: 'violet', motion: 'blast', pack: 'celebrate' },
  { id: 'confetti', emoji: '🎊', label: 'Confetti', tone: 'pink', motion: 'blast', pack: 'celebrate' },
  { id: 'trophy', emoji: '🏆', label: 'Trophy', tone: 'gold', motion: 'bounce', pack: 'celebrate' },
  { id: 'medal', emoji: '🥇', label: 'Gold medal', tone: 'gold', motion: 'spin', pack: 'celebrate' },
  { id: 'crown', emoji: '👑', label: 'Crown', tone: 'gold', motion: 'float', pack: 'celebrate' },
  { id: 'balloon', emoji: '🎈', label: 'Balloon', tone: 'rose', motion: 'float', pack: 'celebrate' },
  { id: 'cake', emoji: '🎂', label: 'Cake', tone: 'pink', motion: 'pop', pack: 'celebrate' },
  { id: 'gift', emoji: '🎁', label: 'Gift', tone: 'violet', motion: 'wiggle', pack: 'celebrate' },
  { id: 'cheers', emoji: '🥂', label: 'Cheers', tone: 'amber', motion: 'shake', pack: 'celebrate' },
  { id: 'sparkle', emoji: '✨', label: 'Sparkle', tone: 'gold', motion: 'flicker', pack: 'celebrate' },
  { id: 'fireworks', emoji: '🎆', label: 'Fireworks', tone: 'violet', motion: 'blast', pack: 'celebrate' },

  // Announce — news / alerts / launches
  { id: 'megaphone', emoji: '📢', label: 'Announce', tone: 'orange', motion: 'ring', pack: 'announce' },
  { id: 'loudspeaker', emoji: '📣', label: 'Shout', tone: 'red', motion: 'ring', pack: 'announce' },
  { id: 'bell', emoji: '🔔', label: 'Alert', tone: 'amber', motion: 'ring', pack: 'announce' },
  { id: 'breaking', emoji: '🗞️', label: 'News', tone: 'slate', motion: 'float', pack: 'announce' },
  { id: 'pin', emoji: '📌', label: 'Pinned', tone: 'red', motion: 'bounce', pack: 'announce' },
  { id: 'flag', emoji: '🚩', label: 'Flag', tone: 'red', motion: 'wave', pack: 'announce' },
  { id: 'siren', emoji: '🚨', label: 'Urgent', tone: 'red', motion: 'pulse', pack: 'announce' },
  { id: 'new', emoji: '🆕', label: 'New', tone: 'sky', motion: 'pop', pack: 'announce' },
  { id: 'up', emoji: '🆙', label: 'Update', tone: 'emerald', motion: 'bounce', pack: 'announce' },
  { id: 'warning', emoji: '⚠️', label: 'Warning', tone: 'amber', motion: 'flicker', pack: 'announce' },
  { id: 'boom', emoji: '💥', label: 'Big news', tone: 'orange', motion: 'blast', pack: 'announce' },
  { id: 'horn', emoji: '🎺', label: 'Fanfare', tone: 'gold', motion: 'shake', pack: 'announce' },

  // Work
  { id: 'rocket', emoji: '🚀', label: 'Ship it', tone: 'slate', motion: 'float', pack: 'work' },
  { id: 'fire', emoji: '🔥', label: 'Fire', tone: 'orange', motion: 'flicker', pack: 'work' },
  { id: 'idea', emoji: '💡', label: 'Idea', tone: 'amber', motion: 'flicker', pack: 'work' },
  { id: 'check', emoji: '✅', label: 'Done', tone: 'emerald', motion: 'bounce', pack: 'work' },
  { id: 'target', emoji: '🎯', label: 'On target', tone: 'red', motion: 'pulse', pack: 'work' },
  { id: 'chart', emoji: '📈', label: 'Growth', tone: 'emerald', motion: 'bounce', pack: 'work' },
  { id: 'search', emoji: '🔍', label: 'Looking', tone: 'violet', motion: 'wiggle', pack: 'work' },
  { id: 'coffee', emoji: '☕', label: 'Coffee', tone: 'orange', motion: 'float', pack: 'work' },
  { id: 'star', emoji: '⭐', label: 'Star', tone: 'amber', motion: 'spin', pack: 'work' },
  { id: 'hundred', emoji: '💯', label: '100', tone: 'rose', motion: 'pop', pack: 'work' },
  { id: 'tools', emoji: '🛠️', label: 'Building', tone: 'slate', motion: 'shake', pack: 'work' },
  { id: 'deadline', emoji: '⏰', label: 'Deadline', tone: 'red', motion: 'ring', pack: 'work' },
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
  gold: 'from-yellow-100 to-amber-200/90 dark:from-yellow-500/30 dark:to-amber-600/25',
  red: 'from-red-100 to-rose-200/80 dark:from-red-500/25 dark:to-rose-700/20',
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
  blast: 'sticker-motion-blast',
  ring: 'sticker-motion-ring',
}

export function stickersInPack(pack: StickerPack): Sticker[] {
  return STICKERS.filter((item) => item.pack === pack)
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

/**
 * Slack / WhatsApp “jumbo” emoji: 1–3 emoji-only messages (no letters/digits/markdown).
 * Returns the grapheme list to render large, or null for normal text.
 */
export function getJumboEmojis(body: string | null | undefined): string[] | null {
  if (!body) return null
  const trimmed = body.trim()
  if (!trimmed || isStickerMessage(trimmed)) return null
  if (/[A-Za-z0-9`*_~\[\]()#/>]/.test(trimmed)) return null

  const graphemes = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed)]
    .map((part) => part.segment)
    .filter((part) => !/^\s+$/.test(part))

  if (graphemes.length < 1 || graphemes.length > 3) return null
  if (!graphemes.every((part) => /\p{Extended_Pictographic}/u.test(part))) return null
  return graphemes
}

export function isJumboEmojiMessage(body: string | null | undefined): boolean {
  return getJumboEmojis(body) !== null
}
