import { onBeforeUnmount, ref } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * Invite / “Start my day” deep-link (?startDay=1).
 * Captured once into a shared ref so the Home highlight and checklist
 * still work after the query is cleared from the URL.
 */
const startDayHighlight = ref(false)

export function consumeStartDayQuery(route: RouteLocationNormalizedLoaded, router: Router) {
  if (route.query.startDay === '1') {
    startDayHighlight.value = true
    const query = { ...route.query }
    delete query.startDay
    void router.replace({ query })
  }
  onBeforeUnmount(() => {
    startDayHighlight.value = false
  })
  return startDayHighlight
}

export function useStartDayHighlight() {
  return startDayHighlight
}
