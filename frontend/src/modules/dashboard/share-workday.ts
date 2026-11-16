import { toast } from 'vue-sonner'

/** Branded invite preview (preferred) or generic workday loop. */
export function workdayShareUrl(slug?: string | null) {
  const origin = window.location.origin
  return slug ? `${origin}/invite/${slug}` : `${origin}/workday`
}

/** One-click copy for Home / admin — viral surface without full signup. */
export async function copyShareWorkday(slug?: string | null) {
  const url = workdayShareUrl(slug)
  const ok = await navigator.clipboard.writeText(url).then(
    () => true,
    () => false,
  )
  if (ok) {
    toast.success('Workday link copied', {
      description: slug
        ? 'Share this to show your team’s loop. People still need a real invite to join.'
        : 'Share this to show Vector’s standup → tasks → meetings → messages loop.',
    })
  } else {
    toast.error('Could not copy the link', { description: url })
  }
  return ok
}
