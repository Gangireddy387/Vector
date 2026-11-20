/** Browser-native types we can show in the shared lightbox (Office Online when a public HTTPS URL exists). */
export type PreviewKind = 'image' | 'pdf' | 'video' | 'audio' | 'office'

const OFFICE_MIME =
  /^(application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/i

export function isOfficeMime(mimeType: string | null | undefined) {
  return OFFICE_MIME.test(mimeType ?? '')
}

export function previewKind(mimeType: string | null | undefined, options?: { office?: boolean }): PreviewKind | null {
  const mime = mimeType ?? ''
  if (/^image\/(png|jpeg|gif|webp)$/i.test(mime)) return 'image'
  if (/^application\/pdf$/i.test(mime)) return 'pdf'
  if (/^video\/(mp4|webm|ogg|quicktime)$/i.test(mime)) return 'video'
  if (/^audio\/(mpeg|mp3|wav|ogg|webm|aac|flac|x-m4a|mp4)$/i.test(mime)) return 'audio'
  if (options?.office && isOfficeMime(mime)) return 'office'
  return null
}

export const isPreviewable = (mimeType: string | null | undefined, options?: { office?: boolean }) =>
  previewKind(mimeType, options) !== null

export const isInlineImage = (mimeType: string | null | undefined) => previewKind(mimeType) === 'image'

/** Microsoft Office Online needs a public https URL it can fetch (not localhost). */
export function canUseOfficeOnline(absoluteUrl: string | null | undefined) {
  if (!absoluteUrl || !/^https:\/\//i.test(absoluteUrl)) return false
  try {
    const host = new URL(absoluteUrl).hostname
    return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local')
  } catch {
    return false
  }
}

export function officeOnlineEmbedUrl(absoluteFileUrl: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteFileUrl)}`
}
