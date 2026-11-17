import { describe, expect, it } from 'vitest'
import type { Department, Team, UserSummary, WorkCounts } from '@/types/models'
import { departmentPeople } from './departments.store'

const emptyWork = (): WorkCounts => ({ total: 0, todo: 0, inProgress: 0, done: 0, overdue: 0 })

const person = (id: string, name: string): UserSummary => ({
  id,
  name,
  email: `${id}@example.test`,
  avatarColor: '#4f46e5',
})

const team = (id: string, name: string, members: UserSummary[], lead: UserSummary): Team => ({
  id,
  departmentId: 'dept-1',
  name,
  description: null,
  leadId: lead.id,
  lead,
  members,
  projectCount: 0,
  work: emptyWork(),
})

const department = (teams: Team[]): Department => ({
  id: 'dept-1',
  name: 'Engineering',
  description: null,
  headId: null,
  head: null,
  teams,
  projectCount: 0,
  work: emptyWork(),
})

describe('departmentPeople', () => {
  it('returns distinct people across teams', () => {
    const ann = person('a', 'Ann')
    const bob = person('b', 'Bob')
    const people = departmentPeople(department([team('t1', 'Platform', [ann, bob], ann), team('t2', 'App', [bob, ann], bob)]))
    expect(people.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('returns an empty list when no teams have members', () => {
    expect(departmentPeople(department([]))).toEqual([])
  })
})
