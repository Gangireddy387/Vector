/*
 * Illustrated teammates for the sign-in showcase. The portraits are DiceBear "avataaars" (by Pablo Stanley, free for
 * commercial use), generated once into src/assets/avatars.
 */
const PORTRAITS = import.meta.glob<string>('../../assets/avatars/*.svg', { eager: true, query: '?url', import: 'default' })

export interface Teammate {
  name: string
  /* Tailwind gradient classes for the portrait's background. */
  tone: string
  src: string
  /** Optional role / title from the showcase gallery. */
  role?: string
  /** Optional feedback quote from the showcase gallery. */
  feedback?: string
}

const person = (name: string, tone: string, role = '', feedback = ''): Teammate => ({
  name,
  tone,
  src: PORTRAITS[`../../assets/avatars/${name.toLowerCase()}.svg`]!,
  role,
  feedback,
})

export const TEAM = {
  priya: person('Priya', 'from-rose-200 to-pink-300', 'Product lead', 'Standups and boards finally live in one place.'),
  arjun: person('Arjun', 'from-amber-200 to-orange-300', 'Engineer', 'Automation cleared our triage queue overnight.'),
  maria: person('Maria', 'from-sky-200 to-blue-300', 'Designer', 'The team sees what shipped without chasing chats.'),
  james: person('James', 'from-emerald-200 to-teal-300', 'Engineering manager', 'Less status meetings, more shipping.'),
  aisha: person('Aisha', 'from-violet-200 to-purple-300', 'PM', 'Recurring work just shows up — no spreadsheet.'),
  kenji: person('Kenji', 'from-cyan-200 to-sky-300', 'Developer', 'AI drafts save me a first pass on every ticket.'),
  sofia: person('Sofia', 'from-fuchsia-200 to-pink-300', 'Designer', 'Reviews and chat stay next to the work.'),
  david: person('David', 'from-lime-200 to-emerald-300', 'Ops', 'Meetings and tasks finally share one timeline.'),
  meera: person('Meera', 'from-indigo-200 to-violet-300', 'Engineer', 'I know who owns what without asking Slack.'),
  liam: person('Liam', 'from-orange-200 to-rose-300', 'Tech lead', 'Velocity without the busywork tax.'),
}
