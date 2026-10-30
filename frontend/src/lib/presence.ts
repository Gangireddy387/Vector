/** Teams-style availability: what each status looks like and is called. */

export type PresenceStatus = 'available' | 'away' | 'busy' | 'dnd' | 'brb' | 'in-call' | 'offline'
/** What people can choose themselves; null follows their activity. */
export type ChosenPresence = 'busy' | 'dnd' | 'brb' | 'away' | 'offline' | null

export const PRESENCE_LOOK: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
  available: { label: 'Available', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
  away: { label: 'Away', dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  brb: { label: 'Be right back', dot: 'bg-amber-400', text: 'text-amber-600 dark:text-amber-400' },
  busy: { label: 'Busy', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  'in-call': { label: 'In a call', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  dnd: { label: 'Do not disturb', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  offline: { label: 'Offline', dot: 'bg-muted-foreground/50', text: 'text-muted-foreground' },
}

/** The choices in the status menu, in Teams' order. */
export const PRESENCE_CHOICES: Array<{ value: ChosenPresence; status: PresenceStatus; label: string }> = [
  { value: null, status: 'available', label: 'Available' },
  { value: 'busy', status: 'busy', label: 'Busy' },
  { value: 'dnd', status: 'dnd', label: 'Do not disturb' },
  { value: 'brb', status: 'brb', label: 'Be right back' },
  { value: 'away', status: 'away', label: 'Appear away' },
  { value: 'offline', status: 'offline', label: 'Appear offline' },
]
