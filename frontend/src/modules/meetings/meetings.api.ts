import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'

export interface MeetingContext {
  type: 'department' | 'team' | 'project'
  id: string
}

export interface MeetingParticipant extends UserSummary {
  joinedAt: string | null
  lastSeenAt: string | null
  isOnline: boolean
}

export interface Meeting {
  id: string
  title: string
  agenda: string | null
  notes: string | null
  startsAt: string
  endsAt: string
  durationMinutes: number
  status: MeetingStatus
  startedAt: string | null
  endedAt: string | null
  host: UserSummary | null
  participants: MeetingParticipant[]
  /** The department, team or project the meeting is for. */
  context: MeetingContext | null
  /** People in the call right now. */
  inCall: string[]
  /** Host or organization admin: can edit, cancel and end it. */
  canManage: boolean
}

export interface MeetingUpdate {
  id: string
  meetingId: string
  authorId: string | null
  author: UserSummary | null
  body: string
  createdAt: string
}

export interface MeetingInput {
  title: string
  agenda: string | null
  startsAt: string
  durationMinutes: number
  participantIds: string[]
  contextType?: MeetingContext['type'] | null
  contextId?: string | null
}

export const meetingsApi = {
  list: (scope: 'upcoming' | 'past', context?: MeetingContext | null) =>
    http
      .get<{ meetings: Meeting[] }>('/meetings', { params: { scope, ...(context ? { contextType: context.type, contextId: context.id } : {}) } })
      .then((r) => r.data.meetings),
  iceServers: () =>
    http.get<{ iceServers: RTCIceServer[]; relay: boolean; ttlSeconds: number }>('/meetings/ice-servers').then((r) => r.data),
  canSchedule: () => http.get<{ canSchedule: boolean }>('/meetings/permissions').then((r) => r.data.canSchedule),
  create: (input: MeetingInput) => http.post<{ meeting: Meeting }>('/meetings', input).then((r) => r.data.meeting),
  get: (meetingId: string) => http.get<{ meeting: Meeting; updates: MeetingUpdate[] }>(`/meetings/${meetingId}`).then((r) => r.data),
  update: (meetingId: string, changes: Partial<MeetingInput> & { notes?: string | null }) =>
    http.patch<{ meeting: Meeting }>(`/meetings/${meetingId}`, changes).then((r) => r.data.meeting),
  remove: (meetingId: string) => http.delete(`/meetings/${meetingId}`),
  cancel: (meetingId: string) => http.post<{ meeting: Meeting }>(`/meetings/${meetingId}/cancel`).then((r) => r.data.meeting),
  end: (meetingId: string) => http.post<{ meeting: Meeting }>(`/meetings/${meetingId}/end`).then((r) => r.data.meeting),
  postUpdate: (meetingId: string, body: string) => http.post<{ update: MeetingUpdate }>(`/meetings/${meetingId}/updates`, { body }).then((r) => r.data.update),
  removeUpdate: (meetingId: string, updateId: string) => http.delete(`/meetings/${meetingId}/updates/${updateId}`),
}
