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
}

const person = (name: string, tone: string): Teammate => ({
  name,
  tone,
  src: PORTRAITS[`../../assets/avatars/${name.toLowerCase()}.svg`]!,
})

export const TEAM = {
  priya: person('Priya', 'from-rose-200 to-pink-300'),
  arjun: person('Arjun', 'from-amber-200 to-orange-300'),
  maria: person('Maria', 'from-sky-200 to-blue-300'),
  james: person('James', 'from-emerald-200 to-teal-300'),
  aisha: person('Aisha', 'from-violet-200 to-purple-300'),
  kenji: person('Kenji', 'from-cyan-200 to-sky-300'),
  sofia: person('Sofia', 'from-fuchsia-200 to-pink-300'),
  david: person('David', 'from-lime-200 to-emerald-300'),
  meera: person('Meera', 'from-indigo-200 to-violet-300'),
  liam: person('Liam', 'from-orange-200 to-rose-300'),
}
