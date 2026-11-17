import { useLocalStorage } from '@vueuse/core'
import { computed } from 'vue'

/** Home sections people can hide; order matches the desktop stack. */
export const HOME_WIDGETS = [
  { key: 'setup', label: 'Setup checklist' },
  { key: 'habit', label: 'Habit coach' },
  { key: 'density', label: 'Team density' },
  { key: 'quickCapture', label: 'Quick capture' },
  { key: 'dayLoop', label: 'Day loop' },
  { key: 'focus', label: 'Focus cards' },
  { key: 'planUnlocks', label: 'Plan unlocks' },
  { key: 'today', label: 'Today' },
  { key: 'briefing', label: 'Daily briefing' },
  { key: 'stats', label: 'Stat cards' },
  { key: 'myWork', label: 'My work' },
  { key: 'projects', label: 'Projects & side panel' },
  { key: 'pulse', label: 'Weekly pulse' },
] as const

export type HomeWidgetKey = (typeof HOME_WIDGETS)[number]['key']

export interface HomeLayoutState {
  hidden: HomeWidgetKey[]
}

const defaults = (): HomeLayoutState => ({ hidden: [] })

/** How this person likes Home laid out; kept in the browser (same idea as board Display). */
export function useHomeLayout() {
  const stored = useLocalStorage<HomeLayoutState>('vector.home.layout', defaults(), { mergeDefaults: true })

  const layout = computed({
    get: () => ({ ...defaults(), ...stored.value, hidden: [...(stored.value.hidden ?? [])] }),
    set: (value: HomeLayoutState) => (stored.value = value),
  })

  const isHidden = (key: HomeWidgetKey) => layout.value.hidden.includes(key)
  const toggle = (key: HomeWidgetKey) => {
    const hidden = layout.value.hidden.includes(key) ? layout.value.hidden.filter((item) => item !== key) : [...layout.value.hidden, key]
    layout.value = { hidden }
  }
  const reset = () => (layout.value = defaults())
  const isCustomized = computed(() => layout.value.hidden.length > 0)

  return { layout, isHidden, toggle, reset, isCustomized, widgets: HOME_WIDGETS }
}
