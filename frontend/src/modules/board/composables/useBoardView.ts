import { useLocalStorage } from '@vueuse/core'
import { computed, type Ref } from 'vue'

export type BoardGroupBy = 'none' | 'assignee' | 'priority' | 'type' | 'epic'
export type BoardDensity = 'comfortable' | 'compact'

/** What a card shows, like the "Display" options of Linear or Jira. */
export interface BoardCardFields {
  key: boolean
  labels: boolean
  epic: boolean
  dueDate: boolean
  points: boolean
  counts: boolean
  priority: boolean
  assignee: boolean
  /** In-context next-action hint on the card. */
  aiHint: boolean
}

export interface BoardViewState {
  groupBy: BoardGroupBy
  density: BoardDensity
  fields: BoardCardFields
  /** Status ids of collapsed columns. */
  collapsedColumns: string[]
  /** Keys of collapsed swimlanes. */
  collapsedLanes: string[]
}

export const DEFAULT_CARD_FIELDS: BoardCardFields = {
  key: true,
  labels: true,
  epic: true,
  dueDate: true,
  points: true,
  counts: true,
  priority: true,
  assignee: true,
  aiHint: true,
}

const defaults = (): BoardViewState => ({ groupBy: 'none', density: 'comfortable', fields: { ...DEFAULT_CARD_FIELDS }, collapsedColumns: [], collapsedLanes: [] })

/** How this person likes to see a project's board; kept in the browser, per project. */
export function useBoardView(projectId: Ref<string>) {
  const stored = useLocalStorage<Record<string, BoardViewState>>('vector.board-views', {}, { mergeDefaults: true })

  const view = computed<BoardViewState>({
    get: () => {
      const saved = stored.value[projectId.value]
      return saved ? { ...defaults(), ...saved, fields: { ...DEFAULT_CARD_FIELDS, ...saved.fields } } : defaults()
    },
    set: (value) => (stored.value = { ...stored.value, [projectId.value]: value }),
  })

  const update = (changes: Partial<BoardViewState>) => (view.value = { ...view.value, ...changes })
  const toggleIn = (key: 'collapsedColumns' | 'collapsedLanes', id: string) => {
    const list = view.value[key]
    update({ [key]: list.includes(id) ? list.filter((item) => item !== id) : [...list, id] })
  }
  const isCustomized = computed(() => JSON.stringify({ ...view.value, collapsedColumns: [], collapsedLanes: [] }) !== JSON.stringify(defaults()))

  return {
    view,
    update,
    setField: (field: keyof BoardCardFields, value: boolean) => update({ fields: { ...view.value.fields, [field]: value } }),
    toggleColumn: (statusId: string) => toggleIn('collapsedColumns', statusId),
    toggleLane: (laneKey: string) => toggleIn('collapsedLanes', laneKey),
    reset: () => update({ ...defaults(), collapsedColumns: view.value.collapsedColumns }),
    isCustomized,
  }
}
