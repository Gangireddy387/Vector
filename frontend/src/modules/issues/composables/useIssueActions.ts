import { toast } from 'vue-sonner'
import { useConfirm } from '@/composables/useConfirm'
import { getErrorMessage } from '@/lib/http'
import { useAuthStore } from '@/modules/auth/auth.store'
import { organizationUrl } from '@/modules/auth/organization-slug'
import { useProjectsStore } from '@/modules/projects/projects.store'
import { useUiStore } from '@/stores/ui.store'
import type { Issue, IssueDetail } from '@/types/models'
import { issuesApi, type UpdateIssueInput } from '../api/issues.api'

type IssueLike = Pick<Issue, 'id' | 'key' | 'projectId'> & Partial<Pick<Issue, 'status' | 'title'>>

/** Common issue mutations with consistent error handling and refresh signalling. */
export function useIssueActions() {
  const ui = useUiStore()
  const projects = useProjectsStore()
  const confirm = useConfirm()

  async function update(issue: IssueLike, changes: UpdateIssueInput): Promise<IssueDetail | null> {
    try {
      const updated = await issuesApi.update(issue.id, changes)
      ui.notifyIssuesChanged()
      return updated
    } catch (error) {
      toast.error(getErrorMessage(error))
      return null
    }
  }

  async function findStatusId(projectId: string, category: 'done' | 'todo') {
    const project = await projects.fetchProject(projectId)
    return project.statuses.find((status) => status.category === category)?.id ?? null
  }

  /** Moves the issue to the first "done" status of its project, with an undo action. */
  async function complete(issue: IssueLike) {
    const previousStatusId = issue.status?.id
    const doneStatusId = await findStatusId(issue.projectId, 'done')
    if (!doneStatusId) return null
    const updated = await update(issue, { statusId: doneStatusId })
    if (updated && previousStatusId) {
      toast.success(`${issue.key} completed`, {
        action: { label: 'Undo', onClick: () => void update(issue, { statusId: previousStatusId }) },
      })
    }
    return updated
  }

  async function reopen(issue: IssueLike) {
    const todoStatusId = await findStatusId(issue.projectId, 'todo')
    return todoStatusId ? update(issue, { statusId: todoStatusId }) : null
  }

  async function remove(issue: IssueLike) {
    const confirmed = await confirm({
      title: `Delete ${issue.key}?`,
      description: 'The issue, its sub-tasks, comments and attachments will be permanently deleted.',
      confirmLabel: 'Delete issue',
      destructive: true,
    })
    if (!confirmed) return false
    try {
      await issuesApi.remove(issue.id)
      ui.notifyIssuesChanged()
      toast.success(`${issue.key} deleted`)
      return true
    } catch (error) {
      toast.error(getErrorMessage(error))
      return false
    }
  }

  async function copyLink(issue: IssueLike) {
    const slug = useAuthStore().organization?.slug
    await navigator.clipboard.writeText(slug ? organizationUrl(slug, `/issues/${issue.key}`) : `${window.location.origin}/issues/${issue.key}`)
    toast.success('Link copied to clipboard')
  }

  return { update, complete, reopen, remove, copyLink }
}
