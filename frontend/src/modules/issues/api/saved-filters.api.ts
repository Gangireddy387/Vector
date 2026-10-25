import { http } from '@/lib/http'
import type { SavedFilter } from '@/types/models'

export const savedFiltersApi = {
  list: (projectId?: string) =>
    http.get<{ filters: SavedFilter[] }>('/saved-filters', { params: { projectId } }).then((r) => r.data.filters),
  create: (input: { name: string; projectId?: string | null; criteria: SavedFilter['criteria'] }) =>
    http.post<{ filter: SavedFilter }>('/saved-filters', input).then((r) => r.data.filter),
  remove: (filterId: string) => http.delete(`/saved-filters/${filterId}`),
}
