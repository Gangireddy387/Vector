import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { workspaceApi } from '@/modules/admin/admin.api'
import type { Department, UserSummary } from '@/types/models'
import { structureApi } from './departments.api'

/** The organization's departments and teams, plus the people who can be placed in them. */
export const useStructureStore = defineStore('structure', () => {
  const departments = ref<Department[] | null>(null)
  const people = ref<UserSummary[]>([])

  async function load() {
    const [structure, members] = await Promise.all([structureApi.list(), workspaceApi.members()])
    departments.value = structure
    people.value = members.filter((member) => member.status === 'active')
  }

  const set = (next: Department[]) => (departments.value = next)
  const department = (id: string) => departments.value?.find((item) => item.id === id) ?? null
  const team = (id: string) => departments.value?.flatMap((item) => item.teams).find((item) => item.id === id) ?? null

  const totals = computed(() => {
    const list = departments.value ?? []
    const placed = new Set(list.flatMap((item) => item.teams.flatMap((team) => team.members.map((member) => member.id))))
    return {
      departments: list.length,
      teams: list.reduce((sum, item) => sum + item.teams.length, 0),
      placed: placed.size,
      unplaced: people.value.filter((person) => !placed.has(person.id)).length,
    }
  })

  return { departments, people, totals, load, set, department, team }
})

/** Distinct people across a department's teams. */
export const departmentPeople = (department: Department) => {
  const byId = new Map<string, UserSummary>()
  department.teams.forEach((team) => team.members.forEach((member) => byId.set(member.id, member)))
  return [...byId.values()]
}
