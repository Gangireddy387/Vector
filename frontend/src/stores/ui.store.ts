import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { CreateIssueInput } from '@/modules/issues/api/issues.api'
import { router } from '@/router'

export type CreateIssueDefaults = Partial<CreateIssueInput>

/** Same breakpoint as `useDevice`: desktop gets side panels, smaller screens get full pages. */
const isDesktopViewport = () => window.matchMedia('(min-width: 1024px)').matches

/** Global UI state shared across layouts: top-bar search, create-issue panel, data refresh signals. */
export const useUiStore = defineStore('ui', () => {
  const isSearchOpen = ref(false)

  /** Bumped after local mutations so any visible list can refetch. */
  const issuesVersion = ref(0)

  /** Defaults of the open create-issue side panel (desktop); `null` when it is closed. */
  const createIssueDefaults = ref<CreateIssueDefaults | null>(null)
  /** Changes on every open so the form starts fresh. */
  const createIssueSession = ref(0)

  /**
   * Starts creating an issue, prefilled from simple defaults (project, parent, sprint, status, assignee, type, title):
   * a side panel over the current page on desktop, the full create page on smaller screens.
   */
  function openCreateIssue(defaults: CreateIssueDefaults = {}) {
    if (isDesktopViewport()) {
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

  const notifyIssuesChanged = () => {
    issuesVersion.value += 1
  }

  return { isSearchOpen, issuesVersion, createIssueDefaults, createIssueSession, openCreateIssue, closeCreateIssue, notifyIssuesChanged }
})
