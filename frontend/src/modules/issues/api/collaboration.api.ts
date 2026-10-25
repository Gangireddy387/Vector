import { http } from '@/lib/http'
import type { Attachment, Comment, WorkLog } from '@/types/models'

export const commentsApi = {
  list: (issueId: string) => http.get<{ comments: Comment[] }>(`/issues/${issueId}/comments`).then((r) => r.data.comments),
  create: (issueId: string, body: string) =>
    http.post<{ comment: Comment }>(`/issues/${issueId}/comments`, { body }).then((r) => r.data.comment),
  update: (commentId: string, body: string) => http.patch<{ comment: Comment }>(`/comments/${commentId}`, { body }).then((r) => r.data.comment),
  remove: (commentId: string) => http.delete(`/comments/${commentId}`),
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
  /** Downloads through the authenticated API and hands the file to the browser. */
  async download(attachment: Attachment) {
    const response = await http.get<Blob>(`/attachments/${attachment.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
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
