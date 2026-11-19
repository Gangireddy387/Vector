import { computed, ref } from 'vue'
import { structureApi } from '@/modules/departments/departments.api'
import { useAuthStore } from '@/modules/auth/auth.store'
import type { Team, TeamWork } from '@/types/models'

const teams = ref<Array<Team & { departmentName: string }>>([])
const workByTeam = ref<Record<string, TeamWork['projects']>>({})
const selectedTeamId = ref<string | null>(null)
const loaded = ref(false)
const loading = ref(false)
let loadPromise: Promise<void> | null = null

/** Shared “My team” snapshot for Home + sidebar (members’ teams from GET /departments). */
export function useMyTeamHome() {
  const auth = useAuthStore()

  const primary = computed(() => {
    if (!teams.value.length) return null
    return teams.value.find((team) => team.id === selectedTeamId.value) ?? teams.value[0] ?? null
  })

  const projects = computed(() => {
    const team = primary.value
    if (!team) return []
    return workByTeam.value[team.id] ?? []
  })

  async function load(force = false) {
    if (!auth.organization) {
      teams.value = []
      workByTeam.value = {}
      loaded.value = true
      return
    }
    if (loaded.value && !force) return
    if (loadPromise && !force) return loadPromise

    loading.value = true
    loadPromise = (async () => {
      try {
        const departments = await structureApi.list()
        const next: Array<Team & { departmentName: string }> = []
        for (const department of departments) {
          for (const team of department.teams) {
            next.push({ ...team, departmentName: department.name })
          }
        }
        teams.value = next
        if (!selectedTeamId.value || !next.some((team) => team.id === selectedTeamId.value)) {
          selectedTeamId.value = next[0]?.id ?? null
        }

        const targets = next.slice(0, 3)
        const entries = await Promise.all(
          targets.map(async (team) => {
            try {
              const work = await structureApi.teamWork(team.id)
              return [team.id, work.projects] as const
            } catch {
              return [team.id, []] as const
            }
          }),
        )
        workByTeam.value = Object.fromEntries(entries)
      } catch {
        teams.value = []
        workByTeam.value = {}
      } finally {
        loaded.value = true
        loading.value = false
        loadPromise = null
      }
    })()

    return loadPromise
  }

  function selectTeam(teamId: string) {
    selectedTeamId.value = teamId
    if (!workByTeam.value[teamId]) {
      void structureApi
        .teamWork(teamId)
        .then((work) => {
          workByTeam.value = { ...workByTeam.value, [teamId]: work.projects }
        })
        .catch(() => undefined)
    }
  }

  return {
    teams,
    primary,
    projects,
    selectedTeamId,
    loaded,
    loading,
    load,
    selectTeam,
  }
}
