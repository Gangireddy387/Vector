import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type MeetingRecurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

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
  /** Repeating meetings: each occurrence is its own meeting in the same series. */
  recurrence: MeetingRecurrence | null
  seriesId: string | null
  /** People in the call right now. */
  inCall: string[]
  guestsInCall: number
  /** Whether people outside the organization can ask to join with a link. */
  guestAccess: boolean
  /** The link's secret, for the people who manage the meeting. */
  guestToken: string | null
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

export interface MeetingPoll {
  id: string
  meetingId: string
  question: string
  options: Array<{ text: string; votes: number }>
  total: number
  status: 'open' | 'closed'
  createdBy: { id: string; name: string } | null
  createdById: string | null
  createdAt: string
  /** The answer this person chose. */
  myVote: number | null
}

export interface WhiteboardStroke {
  id: string
  owner: string
  color: string
  width: number
  tool: 'pen' | 'highlighter'
  /** [x, y, x, y…] between 0 and 1 of the board. */
  points: number[]
}

export interface MeetingInput {
  title: string
  agenda: string | null
  startsAt: string
  durationMinutes: number
  participantIds: string[]
  recurrence?: MeetingRecurrence | null
  contextType?: MeetingContext['type'] | null
  contextId?: string | null
  guestAccess?: boolean
}

export interface GuestLinkInfo {
  meeting: {
    id: string
    title: string
    startsAt: string
    endsAt: string
    durationMinutes: number
    status: MeetingStatus
    host: { name: string; avatarUrl: string | null; avatarColor: string } | null
  }
  organization: { id: string; name: string; logoUrl: string | null }
  joinable: boolean
  reason: string | null
}

export interface GuestPass extends GuestLinkInfo {
  token: string
  guest: { id: string; name: string }
  ice: { iceServers: RTCIceServer[]; relay: boolean; ttlSeconds: number }
}

export const guestLinkUrl = (token: string) => `${window.location.origin}/join/${token}`

export const meetingsApi = {
  list: (scope: 'upcoming' | 'past', context?: MeetingContext | null) =>
    http
      .get<{ meetings: Meeting[] }>('/meetings', { params: { scope, ...(context ? { contextType: context.type, contextId: context.id } : {}) } })
      .then((r) => r.data.meetings),
  iceServers: () =>
    http.get<{ iceServers: RTCIceServer[]; relay: boolean; ttlSeconds: number }>('/meetings/ice-servers').then((r) => r.data),
  canSchedule: () => http.get<{ canSchedule: boolean }>('/meetings/permissions').then((r) => r.data.canSchedule),
  create: (input: MeetingInput) => http.post<{ meeting: Meeting }>('/meetings', input).then((r) => r.data.meeting),
  get: (meetingId: string) =>
    http
      .get<{ meeting: Meeting; updates: MeetingUpdate[]; polls: MeetingPoll[]; whiteboard: { strokes: WhiteboardStroke[] } | null }>(`/meetings/${meetingId}`)
      .then((r) => r.data),
  update: (meetingId: string, changes: Partial<MeetingInput> & { notes?: string | null }) =>
    http.patch<{ meeting: Meeting }>(`/meetings/${meetingId}`, changes).then((r) => r.data.meeting),
  remove: (meetingId: string) => http.delete(`/meetings/${meetingId}`),
  cancel: (meetingId: string, series = false) => http.post<{ meeting: Meeting }>(`/meetings/${meetingId}/cancel`, { series }).then((r) => r.data.meeting),
  end: (meetingId: string) => http.post<{ meeting: Meeting }>(`/meetings/${meetingId}/end`).then((r) => r.data.meeting),
  setGuestAccess: (meetingId: string, enabled: boolean, reset = false) =>
    http.post<{ meeting: Meeting }>(`/meetings/${meetingId}/guest-link`, { enabled, reset }).then((r) => r.data.meeting),
  postUpdate: (meetingId: string, body: string) => http.post<{ update: MeetingUpdate }>(`/meetings/${meetingId}/updates`, { body }).then((r) => r.data.update),
  removeUpdate: (meetingId: string, updateId: string) => http.delete(`/meetings/${meetingId}/updates/${updateId}`),
  guestLink: (token: string) => http.get<GuestLinkInfo>(`/meeting-links/${token}`).then((r) => r.data),
  joinAsGuest: (token: string, name: string) => http.post<GuestPass>(`/meeting-links/${token}/guests`, { name }).then((r) => r.data),
}
