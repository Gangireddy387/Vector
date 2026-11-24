import { useRoute, useRouter } from 'vue-router'
import { useDevice } from '@/composables/useDevice'

/**
 * Wide / laptop+ opens issues in a side panel (`?issue=`) so boards and lists keep context.
 * Phone and tablet navigate to the full-screen issue page.
 */
export function useOpenIssue() {
  const route = useRoute()
  const router = useRouter()
  const { isWide } = useDevice()

  return (issue: { key: string }) => {
    if (isWide.value) void router.push({ query: { ...route.query, issue: issue.key } })
    else void router.push({ name: 'issue', params: { issueKey: issue.key } })
  }
}
