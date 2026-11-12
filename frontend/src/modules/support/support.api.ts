import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

/** A message between the portal's super admin and an organization's admins. */
export interface SupportMessage {
  id: string
  organizationId: string
  authorId: string | null
  author: UserSummary | null
  /** Written by the super admin (Vector team) rather than the organization. */
  fromPortal: boolean
  /** `system` notices (such as disappearing messages turned on) show as a centred note; `recording` is a saved call recording. */
  kind: 'message' | 'system' | 'recording'
  /** For `recording` messages: the saved video of a support call. */
  recording: SupportRecording | null
  body: string
  readAt: string | null
  /** Deleted for everyone by its author. */
  deletedAt: string | null
  /** Disappearing message: gone after this moment. */
  expiresAt: string | null
  /** When its author last changed the text. */
  editedAt: string | null
  createdAt: string
}

export interface SupportRecording {
  id: string
  meetingId: string
  durationSeconds: number | null
  sizeBytes: number | null
  mimeType: string | null
  startedAt: string
}

/** Disappearing-message timer in hours, or null when messages are kept. */
export type DisappearHours = 24 | 168 | null

/** A video call between the Vector team and the organization's admins that is still going. */
export interface SupportCall {
  id: string
  title: string
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  startsAt: string
  endsAt: string
  /** Where this side opens the call. */
  url: string
}

export interface SupportThread {
  messages: SupportMessage[]
  unread: number
  disappearHours: DisappearHours
  call: SupportCall | null
}

/** What the call page needs before joining. */
export interface SupportCallInfo {
  call: SupportCall & { host: UserSummary | null; startedAt: string | null }
  organization: { id: string; name: string; logoUrl: string | null }
  side: 'portal' | 'organization'
  joinable: boolean
  reason: string | null
  ice: { iceServers: RTCIceServer[] }
}

/** One side of one conversation. */
export interface SupportChatApi {
  thread: () => Promise<SupportThread>
  send: (body: string) => Promise<SupportMessage>
  /** Changes the text of one of this side's messages. */
  edit: (messageId: string, body: string) => Promise<SupportMessage>
  markRead: () => Promise<unknown>
  /** Deletes one of this side's messages for everyone. */
  remove: (messageId: string) => Promise<SupportMessage>
  /** Deletes any message for the signed-in person only. */
  hide: (messageId: string) => Promise<unknown>
  /** Empties the conversation for the signed-in person only. */
  clear: () => Promise<SupportThread>
  setDisappearing: (hours: DisappearHours) => Promise<SupportThread>
  /** Starts a video call with the other side, or returns the one already going. */
  startCall: () => Promise<SupportCall>
}

const thread = (request: Promise<{ data: SupportThread }>) => request.then((r) => r.data)
const sent = (request: Promise<{ data: { message: SupportMessage } }>) => request.then((r) => r.data.message)

const startCallFor = (organizationId?: string) =>
  http.post<{ call: SupportCall }>('/support-calls', organizationId ? { organizationId } : {}).then((r) => r.data.call)

/** The same endpoints on both sides, under a different base path. */
const chatAt = (base: string, organizationId?: string): SupportChatApi => ({
  startCall: () => startCallFor(organizationId),
  thread: () => thread(http.get(base)),
  send: (body) => sent(http.post(base, { body })),
  edit: (messageId, body) => sent(http.patch(`${base}/messages/${messageId}`, { body })),
  markRead: () => http.post(`${base}/read`),
  remove: (messageId) => sent(http.delete(`${base}/messages/${messageId}`)),
  hide: (messageId) => http.post(`${base}/messages/${messageId}/hide`),
  clear: () => thread(http.post(`${base}/clear`)),
  setDisappearing: (hours) => thread(http.put(`${base}/disappearing`, { hours })),
})

/** The super admin's side: one conversation per organization. */
export const portalSupportApi = {
  unread: () => http.get<{ unread: Record<string, number> }>('/super-admin/support/unread').then((r) => r.data.unread),
  chat: (organizationId: string) => chatAt(`/super-admin/organizations/${organizationId}/support`, organizationId),
}

/** The organization admins' side of their conversation with the Vector team. */
export const organizationSupportApi = chatAt('/workspace/support')

/** The call page of a support call (both sides). */
export const supportCallApi = {
  get: (meetingId: string) => http.get<SupportCallInfo>(`/support-calls/${meetingId}`).then((r) => r.data),
  end: (meetingId: string) => http.post<SupportCallInfo>(`/support-calls/${meetingId}/end`).then((r) => r.data),
  /** The finished recording, made in this browser; it appears in the support chat. */
  uploadRecording: (meetingId: string, recordingId: string, file: Blob, durationSeconds: number, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('durationSeconds', String(durationSeconds))
    form.append('file', file, `recording.${file.type.includes('mp4') ? 'mp4' : 'webm'}`)
    return http
      .post<{ message: SupportMessage }>(`/support-calls/${meetingId}/recordings/${recordingId}`, form, {
        timeout: 0,
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.message)
  },
  removeRecording: (meetingId: string, recordingId: string) => http.delete(`/support-calls/${meetingId}/recordings/${recordingId}`),
  /** A link to watch or download, valid for a few hours. */
  recordingLink: (recording: SupportRecording) =>
    http.get<{ url: string }>(`/support-calls/${recording.meetingId}/recordings/${recording.id}/link`).then((r) => r.data.url),
}
