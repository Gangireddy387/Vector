import { useRoute, useRouter } from 'vue-router'
import { useDevice } from '@/composables/useDevice'

/** Desktop opens issues in a side panel (keeps context); phones navigate to the full-screen issue page. */
export function useOpenIssue() {
  const route = useRoute()
  const router = useRouter()
  const { isDesktop } = useDevice()

  return (issue: { key: string }) => {
    if (isDesktop.value) void router.push({ query: { ...route.query, issue: issue.key } })
    else void router.push({ name: 'issue', params: { issueKey: issue.key } })
  }
}
