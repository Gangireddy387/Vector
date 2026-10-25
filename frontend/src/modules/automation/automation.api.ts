import { http } from '@/lib/http'
import type { AutomationRule, IssueTemplate, RecurringTask } from '@/types/models'

export type RuleInput = Pick<AutomationRule, 'name' | 'trigger' | 'conditions' | 'actions' | 'enabled'> & {
  description?: string | null
}

export type TemplateInput = Omit<IssueTemplate, 'id' | 'projectId'>

export type RecurringTaskInput = Omit<RecurringTask, 'id' | 'projectId' | 'assignee' | 'nextRunAt' | 'lastRunAt'>

export const automationApi = {
  listRules: (projectId: string) =>
    http.get<{ rules: AutomationRule[] }>(`/projects/${projectId}/automations`).then((r) => r.data.rules),
  createRule: (projectId: string, input: RuleInput) =>
    http.post<{ rule: AutomationRule }>(`/projects/${projectId}/automations`, input).then((r) => r.data.rule),
  updateRule: (projectId: string, ruleId: string, changes: Partial<RuleInput>) =>
    http.patch<{ rule: AutomationRule }>(`/projects/${projectId}/automations/${ruleId}`, changes).then((r) => r.data.rule),
  removeRule: (projectId: string, ruleId: string) => http.delete(`/projects/${projectId}/automations/${ruleId}`),
}

export const templatesApi = {
  list: (projectId: string) =>
    http.get<{ templates: IssueTemplate[] }>(`/projects/${projectId}/templates`).then((r) => r.data.templates),
  create: (projectId: string, input: TemplateInput) =>
    http.post<{ template: IssueTemplate }>(`/projects/${projectId}/templates`, input).then((r) => r.data.template),
  update: (projectId: string, templateId: string, changes: Partial<TemplateInput>) =>
    http.patch<{ template: IssueTemplate }>(`/projects/${projectId}/templates/${templateId}`, changes).then((r) => r.data.template),
  remove: (projectId: string, templateId: string) => http.delete(`/projects/${projectId}/templates/${templateId}`),
}

export const recurringTasksApi = {
  list: (projectId: string) =>
    http.get<{ recurringTasks: RecurringTask[] }>(`/projects/${projectId}/recurring-tasks`).then((r) => r.data.recurringTasks),
  create: (projectId: string, input: RecurringTaskInput) =>
    http.post<{ recurringTask: RecurringTask }>(`/projects/${projectId}/recurring-tasks`, input).then((r) => r.data.recurringTask),
  update: (projectId: string, taskId: string, changes: Partial<RecurringTaskInput>) =>
    http
      .patch<{ recurringTask: RecurringTask }>(`/projects/${projectId}/recurring-tasks/${taskId}`, changes)
      .then((r) => r.data.recurringTask),
  remove: (projectId: string, taskId: string) => http.delete(`/projects/${projectId}/recurring-tasks/${taskId}`),
  runNow: (projectId: string, taskId: string) =>
    http.post<{ issueId: string; key: string }>(`/projects/${projectId}/recurring-tasks/${taskId}/run`).then((r) => r.data),
}
