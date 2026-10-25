import { http } from '@/lib/http'
import type { IssuePriority, IssueType, ProjectType, Sprint, StatusCategory, UserSummary } from '@/types/models'

export interface ProjectSummaryReport {
  totals: { total: number; open: number; done: number; overdue: number; completionRate: number; averageCycleDays: number | null }
  byStatus: Array<{ id: string; name: string; color: string; category: StatusCategory; count: number }>
  byType: Array<{ type: IssueType; count: number }>
  byPriority: Array<{ priority: IssuePriority; count: number }>
  workload: Array<{ user: UserSummary | null; openCount: number; openPoints: number }>
  timeline: Array<{ date: string; created: number; resolved: number }>
}

export interface ReportFilters {
  projectId?: string
  days: number
  assigneeId?: string
  type?: string
  priority?: string
}

export interface ReportProject {
  id: string
  name: string
  key: string
  color: string
  type: ProjectType
}

export interface ReportInsight {
  tone: 'positive' | 'warning' | 'neutral'
  text: string
}

export interface ReportOverview {
  period: { days: number; from: string; to: string }
  projects: ReportProject[]
  totals: {
    total: number
    open: number
    done: number
    overdue: number
    dueSoon: number
    unassigned: number
    completionRate: number
    createdInPeriod: number
    completedInPeriod: number
    createdChange: number | null
    completedChange: number | null
    averageCycleDays: number | null
    previousCycleDays: number | null
    openPoints: number
  }
  timeline: Array<{ date: string; bucket: 'day' | 'week'; created: number; resolved: number }>
  byStatusCategory: Array<{ category: StatusCategory; count: number }>
  byStatus: Array<{ id: string; name: string; color: string; category: StatusCategory; count: number }>
  byType: Array<{ type: IssueType; count: number }>
  byPriority: Array<{ priority: IssuePriority; count: number }>
  byProject: Array<{
    project: ReportProject
    total: number
    open: number
    done: number
    overdue: number
    completedInPeriod: number
    completionRate: number
    averageCycleDays: number | null
  }>
  workload: Array<{ user: UserSummary | null; open: number; openPoints: number; overdue: number; completedInPeriod: number }>
  insights: ReportInsight[]
}

export interface ProjectProgress {
  project: { id: string; name: string; key: string; color: string; type: ProjectType; lead: UserSummary | null; createdAt: string }
  ageDays: number
  totals: {
    issues: number
    done: number
    open: number
    points: number
    donePoints: number
    completion: number
    pointsCompletion: number | null
    averageLeadTimeDays: number | null
  }
  burnup: Array<{ date: string; bucket: 'day' | 'week'; scope: number; completed: number; scopePoints: number; completedPoints: number }>
  stages: Array<{
    id: string
    name: string
    color: string
    category: StatusCategory
    wipLimit: number | null
    count: number
    points: number
    averageDaysSpent: number | null
    passes: number
    currentAverageAgeDays: number | null
  }>
  forecast: {
    state: 'no_data' | 'complete' | 'stalled' | 'on_track' | 'at_risk'
    perWeek: number
    scopePerWeek: number
    weeksLeft: number | null
    estimatedDate: string | null
  }
  milestones: Array<{
    date: string
    kind: 'created' | 'first_done' | 'sprint_started' | 'sprint_completed' | 'progress' | 'completed' | 'today'
    title: string
    detail: string | null
  }>
}

export interface BurndownReport {
  sprint: Sprint
  unit: 'points' | 'issues'
  total: number
  points: Array<{ date: string; ideal: number; remaining: number | null }>
}

export interface VelocityReport {
  sprints: Array<{ sprintId: string; name: string; committed: number; completed: number; completedIssues: number }>
  averageVelocity: number
}

export interface Contributor {
  user: UserSummary
  total: number
  done: number
  points: number
  donePoints: number
}

interface WorkStats {
  total: number
  done: number
  inProgress: number
  todo: number
  points: number
  donePoints: number
  completion: number
  overdue: number
  startedAt: string | null
  finishedAt: string | null
  contributors: Contributor[]
}

export type ModuleHealth = 'done' | 'on_track' | 'at_risk' | 'overdue' | 'not_started' | 'empty'

export interface ModuleProgress extends WorkStats {
  id: string
  key: string
  title: string
  status: { name: string; color: string; category: StatusCategory } | null
  owner: UserSummary | null
  startDate: string | null
  dueDate: string | null
  createdAt: string
  health: ModuleHealth
}

export interface ModulesReport {
  modules: ModuleProgress[]
  unplanned: WorkStats | null
  totals: { modules: number; done: number; atRisk: number; overdue: number }
}

export interface SprintProgress {
  id: string
  name: string
  goal: string | null
  state: 'planned' | 'active' | 'completed'
  startDate: string | null
  endDate: string | null
  completedAt: string | null
  durationDays: number | null
  elapsedDays: number | null
  daysLeft: number | null
  finishedLate: boolean
  committed: number
  delivered: number
  committedPoints: number
  deliveredPoints: number
  carriedOver: number
  inProgress: number
  completion: number
  contributors: Contributor[]
}

export interface SprintsReport {
  sprints: SprintProgress[]
  totals: {
    completed: number
    averageCompletion: number | null
    averageDeliveredPoints: number | null
    averageDelivered: number | null
    totalCarriedOver: number
  }
}

export interface PerformanceFilters {
  projectId?: string
  from: string
  to: string
}

export interface MemberPerformance {
  user: UserSummary
  roles: Array<'admin' | 'member' | 'viewer'>
  rank: number | null
  score: number | null
  completed: number
  completedPoints: number
  bugsFixed: number
  highPriorityDone: number
  withDueDate: number
  onTime: number
  onTimeRate: number | null
  averageCycleDays: number | null
  reopened: number
  loggedMinutes: number
  comments: number
  created: number
  open: number
  openPoints: number
  overdue: number
  trend: number[]
  projects: Array<{ project: ReportProject; completed: number; points: number }>
}

export interface PerformanceHighlight {
  kind: 'top_delivery' | 'most_reliable' | 'fastest' | 'bug_hunter' | 'collaborator' | 'most_hours'
  userId: string
  title: string
  detail: string
}

export interface TeamPerformanceReport {
  period: { from: string; to: string }
  projects: ReportProject[]
  unit: 'points' | 'issues'
  buckets: Array<{ start: string; unit: 'week' | 'month' }>
  totals: {
    people: number
    completed: number
    completedPoints: number
    onTimeRate: number | null
    averageCycleDays: number | null
    loggedMinutes: number
    reopened: number
  }
  highlights: PerformanceHighlight[]
  members: MemberPerformance[]
}

export interface ReviewIssue {
  id: string
  key: string
  title: string
  type: IssueType
  priority: IssuePriority
  storyPoints: number | null
  dueDate: string | null
  status: { name: string; category: StatusCategory } | null
  project: ReportProject | null
  module: { id: string; key: string; title: string } | null
  sprint: { id: string; name: string; state: SprintProgress['state'] } | null
}

export interface MemberReview {
  period: { from: string; to: string }
  unit: 'points' | 'issues'
  buckets: TeamPerformanceReport['buckets']
  team: { people: number; averageCompleted: number | null; totals: TeamPerformanceReport['totals'] }
  member: MemberPerformance
  completed: Array<ReviewIssue & { completedAt: string; onTime: boolean | null; cycleDays: number | null }>
  open: Array<ReviewIssue & { overdue: boolean }>
  reopened: ReviewIssue[]
  byModule: Array<{ module: ReviewIssue['module']; completed: number; points: number }>
  bySprint: Array<{ sprint: ReviewIssue['sprint']; completed: number; points: number }>
}

export const reportsApi = {
  progress: (projectId: string) => http.get<ProjectProgress>(`/projects/${projectId}/reports/progress`).then((r) => r.data),
  modules: (projectId: string) => http.get<ModulesReport>(`/projects/${projectId}/reports/modules`).then((r) => r.data),
  sprints: (projectId: string) => http.get<SprintsReport>(`/projects/${projectId}/reports/sprints`).then((r) => r.data),
  performance: (filters: PerformanceFilters) => http.get<TeamPerformanceReport>('/reports/performance', { params: filters }).then((r) => r.data),
  memberReview: (userId: string, filters: PerformanceFilters) =>
    http.get<MemberReview>(`/reports/performance/${userId}`, { params: filters }).then((r) => r.data),
  overview: (filters: ReportFilters) => http.get<ReportOverview>('/reports/overview', { params: filters }).then((r) => r.data),
  summary: (projectId: string, days = 30) =>
    http.get<ProjectSummaryReport>(`/projects/${projectId}/reports/summary`, { params: { days } }).then((r) => r.data),
  burndown: (projectId: string, sprintId: string) =>
    http.get<BurndownReport>(`/projects/${projectId}/reports/sprints/${sprintId}/burndown`).then((r) => r.data),
  velocity: (projectId: string) => http.get<VelocityReport>(`/projects/${projectId}/reports/velocity`).then((r) => r.data),
}
