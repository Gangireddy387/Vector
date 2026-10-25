import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreateIssueInput } from '@/modules/issues/api/issues.api'
import { router } from '@/router'

export type CreateIssueDefaults = Partial<CreateIssueInput>

/** Global UI state shared across layouts: top-bar search, create-issue navigation, data refresh signals. */
export const useUiStore = defineStore('ui', () => {
  const isSearchOpen = ref(false)

  /** Bumped after local mutations so any visible list can refetch. */
  const issuesVersion = ref(0)

  /** Opens the create-issue page, prefilled from simple defaults (project, parent, sprint, status, assignee, type, title). */
  function openCreateIssue(defaults: CreateIssueDefaults = {}) {
    const query = Object.fromEntries(
      Object.entries(defaults).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''),
    )
    void router.push({ name: 'issue-create', query })
  }

  const notifyIssuesChanged = () => {
    issuesVersion.value += 1
  }

  return { isSearchOpen, issuesVersion, openCreateIssue, notifyIssuesChanged }
})
