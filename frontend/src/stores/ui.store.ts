import { defineStore } from 'pinia'
import { ref } from 'vue'
import { matchesWideViewport } from '@/composables/useDevice'
import type { CreateIssueInput } from '@/modules/issues/api/issues.api'
import { router } from '@/router'

export type CreateIssueDefaults = Partial<CreateIssueInput>

/** Global UI state shared across layouts: top-bar search, create-issue panel, data refresh signals. */
export const useUiStore = defineStore('ui', () => {
  const isSearchOpen = ref(false)

  /** Opens the full Help & user guide page (optional topic deep-link). */
  function openHelp(topicId?: string | null) {
    void router.push({ name: 'help', query: topicId ? { topic: topicId } : undefined })
  }

  /** Shared create-project dialog (sidebar + Help “try” actions). */
  const isCreateProjectOpen = ref(false)
  const openCreateProject = () => {
    isCreateProjectOpen.value = true
  }

  /** Bumped after local mutations so any visible list can refetch. */
  const issuesVersion = ref(0)
  /** Brief board/list highlight after create or a status move (clears itself). */
  const highlightedIssueId = ref<string | null>(null)
  let highlightTimer: ReturnType<typeof setTimeout> | null = null

  /** Defaults of the open create-issue side panel (wide / laptop+); `null` when it is closed. */
  const createIssueDefaults = ref<CreateIssueDefaults | null>(null)
  /** Changes on every open so the form starts fresh. */
  const createIssueSession = ref(0)

  /**
   * Starts creating an issue, prefilled from simple defaults (project, parent, sprint, status, assignee, type, title):
   * a side panel over the current page on wide viewports (≥1024px), the full create page on phone/tablet.
   */
  function openCreateIssue(defaults: CreateIssueDefaults = {}) {
    if (matchesWideViewport()) {
      createIssueSession.value += 1
      createIssueDefaults.value = { ...defaults }
      return
    }
    const query = Object.fromEntries(
      Object.entries(defaults).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
    )
    void router.push({ name: 'issue-create', query })
  }

  const closeCreateIssue = () => {
    createIssueDefaults.value = null
  }

  function highlightIssue(issueId: string) {
    highlightedIssueId.value = issueId
    if (highlightTimer) clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => {
      if (highlightedIssueId.value === issueId) highlightedIssueId.value = null
      highlightTimer = null
    }, 900)
  }

  const notifyIssuesChanged = (issueId?: string) => {
    issuesVersion.value += 1
    if (issueId) highlightIssue(issueId)
  }

  return {
    isSearchOpen,
    openHelp,
    isCreateProjectOpen,
    openCreateProject,
    issuesVersion,
    highlightedIssueId,
    createIssueDefaults,
    createIssueSession,
    openCreateIssue,
    closeCreateIssue,
    highlightIssue,
    notifyIssuesChanged,
  }
})
