import { http } from '@/lib/http'
import type { ActiveTimer, Attachment, Comment, CommentReaction, WorkLog } from '@/types/models'

/** Same fixed set as project chat / DMs. */
export const COMMENT_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const

export const commentsApi = {
  list: (issueId: string) => http.get<{ comments: Comment[] }>(`/issues/${issueId}/comments`).then((r) => r.data.comments),
  create: (issueId: string, body: string, options?: { parentId?: string | null }) =>
    http
      .post<{ comment: Comment }>(`/issues/${issueId}/comments`, {
        body,
        ...(options?.parentId ? { parentId: options.parentId } : {}),
      })
      .then((r) => r.data.comment),
  update: (commentId: string, body: string) => http.patch<{ comment: Comment }>(`/comments/${commentId}`, { body }).then((r) => r.data.comment),
  remove: (commentId: string) => http.delete(`/comments/${commentId}`),
  react: (commentId: string, emoji: string) =>
    http.post<{ commentId: string; reactions: CommentReaction[] }>(`/comments/${commentId}/reactions`, { emoji }).then((r) => r.data),
}

export type AttachmentLink = {
  url: string
  absoluteUrl: string | null
  thumbUrl: string | null
  officeEmbedUrl: string | null
}

export const attachmentsApi = {
  list: (issueId: string) =>
    http.get<{ attachments: Attachment[] }>(`/issues/${issueId}/attachments`).then((r) => r.data.attachments),
  upload: (issueId: string, files: File[], onProgress?: (percent: number) => void) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return http
      .post<{ attachments: Attachment[] }>(`/issues/${issueId}/attachments`, form, {
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.attachments)
  },
  uploadForComment: (commentId: string, files: File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return http
      .post<{ attachments: Attachment[] }>(`/comments/${commentId}/attachments`, form)
      .then((r) => r.data.attachments)
  },
  link: (attachmentId: string) =>
    http.get<AttachmentLink>(`/attachments/${attachmentId}/link`).then((r) => r.data),
  /** Authenticated blob URL for in-app preview (caller should revoke when done). */
  async blobUrl(attachment: Attachment, inline = true) {
    const response = await http.get<Blob>(`/attachments/${attachment.id}/download`, {
      responseType: 'blob',
      params: inline ? { inline: 1 } : undefined,
    })
    return URL.createObjectURL(response.data)
  },
  /** Downloads through the authenticated API and hands the file to the browser. */
  async download(attachment: Attachment) {
    const url = await attachmentsApi.blobUrl(attachment, false)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = attachment.fileName
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
  remove: (attachmentId: string) => http.delete(`/attachments/${attachmentId}`),
}

export const workLogsApi = {
  list: (issueId: string) => http.get<{ workLogs: WorkLog[] }>(`/issues/${issueId}/work-logs`).then((r) => r.data.workLogs),
  create: (issueId: string, payload: { minutes: number; note?: string | null; loggedAt?: string }) =>
    http.post<{ workLog: WorkLog }>(`/issues/${issueId}/work-logs`, payload).then((r) => r.data.workLog),
  remove: (workLogId: string) => http.delete(`/work-logs/${workLogId}`),
}

export const timerApi = {
  get: () => http.get<{ timer: ActiveTimer | null }>('/me/timer').then((r) => r.data.timer),
  start: (issueId: string, note?: string | null) =>
    http
      .post<{ timer: ActiveTimer; stopped: { workLog: WorkLog; issueKey: string; minutes: number } | null }>(
        `/issues/${issueId}/timer/start`,
        { note: note ?? null },
      )
      .then((r) => r.data),
  stop: (note?: string | null) =>
    http
      .post<{ timer: null; workLog: WorkLog; issueKey: string; minutes: number }>('/me/timer/stop', {
        note: note ?? null,
      })
      .then((r) => r.data),
  discard: () => http.post<{ timer: null }>('/me/timer/discard').then((r) => r.data),
}
