import { toast } from 'vue-sonner'

/** Public workday loop page (optional org slug for signup context). */
export function workdayShareUrl(slug?: string | null) {
  const origin = window.location.origin
  return slug ? `${origin}/workday?org=${encodeURIComponent(slug)}` : `${origin}/workday`
}

/** One-click copy for Home / admin — show the workday loop without full signup. */
export async function copyShareWorkday(slug?: string | null) {
  const url = workdayShareUrl(slug)
  const ok = await navigator.clipboard.writeText(url).then(
    () => true,
    () => false,
  )
  if (ok) {
    toast.success('Workday link copied', {
      description: 'Share Vector’s standup → tasks → meetings → messages loop. People still need a real invite to join your workspace.',
    })
  } else {
    toast.error('Could not copy the link', { description: url })
  }
  return ok
}
