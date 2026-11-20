import { http } from '@/lib/http'
import type { SavedFilter, SavedFilterSurface } from '@/types/models'

export const savedFiltersApi = {
  list: (projectId?: string, surface: SavedFilterSurface = 'issues') =>
    http
      .get<{ filters: SavedFilter[] }>('/saved-filters', { params: { projectId, surface } })
      .then((r) => r.data.filters),
  create: (input: {
    name: string
    projectId?: string | null
    surface?: SavedFilterSurface
    criteria: SavedFilter['criteria']
    isDefault?: boolean
  }) => http.post<{ filter: SavedFilter }>('/saved-filters', input).then((r) => r.data.filter),
  update: (filterId: string, input: { name?: string; criteria?: SavedFilter['criteria']; isDefault?: boolean }) =>
    http.patch<{ filter: SavedFilter }>(`/saved-filters/${filterId}`, input).then((r) => r.data.filter),
  remove: (filterId: string) => http.delete(`/saved-filters/${filterId}`),
}
