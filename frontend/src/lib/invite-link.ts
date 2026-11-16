import { toast } from 'vue-sonner'

const copy = (link: string) => navigator.clipboard.writeText(link).then(() => true, () => false)

/**
 * The organization's plan leaves invitation emails out: the admin gets the sign-up link instead (copied right away)
 * and sends it to the new person themselves.
 */
export async function shareInviteLink(email: string, link: string, options?: { previewUrl?: string | null }) {
  const copied = await copy(link)
  const previewHint = options?.previewUrl
    ? ` You can also share the workday preview: ${options.previewUrl}`
    : ''
  toast.success(`${email} was invited`, {
    description: copied
      ? `Your plan does not include invitation emails, so the sign-up link was copied. Send it to them to join.${previewHint}`
      : `Your plan does not include invitation emails. Copy the sign-up link and send it to them to join.${previewHint}`,
    duration: 30_000,
    action: { label: 'Copy link', onClick: () => void copy(link).then((ok) => ok && toast.success('Sign-up link copied')) },
  })
}
