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
  /** Written by the AI assistant from the transcript, chat, updates and notes. */
  summary: MeetingSummary | null
}

export interface MeetingSummary {
  text: string
  decisions: string[]
  actionItems: Array<{ text: string; owner: string | null }>
  generatedAt: string
}

/** A message from the call's chat, kept with the meeting (`roomName`: the breakout room it was sent in). */
export interface SavedChatMessage {
  id: string
  at: string
  author: UserSummary
  body: string
  room: string | null
  roomName: string | null
  broadcast: boolean
}

export interface TranscriptLine {
  id: string
  speaker: { id: string; name: string; guest: boolean }
  text: string
  at: string
}

export interface MeetingRecording {
  id: string
  status: 'recording' | 'ready' | 'failed'
  mimeType: string | null
  sizeBytes: number | null
  durationSeconds: number | null
  startedAt: string
  createdBy: { id: string; name: string } | null
  canDelete: boolean
}

/** What this server's calls can do. */
export interface MeetingCapabilities {
  /** 'sfu': video goes through a media server (large calls); 'direct': between browsers. */
  media: 'sfu' | 'direct'
  capacity: number
  summaries: boolean
  reminderMinutes: number
  recordingMaxMb: number
}

export interface MeetingDetails {
  meeting: Meeting
  updates: MeetingUpdate[]
  polls: MeetingPoll[]
  whiteboard: { strokes: WhiteboardStroke[] } | null
  chat: SavedChatMessage[]
  transcript: TranscriptLine[]
  recordings: MeetingRecording[]
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
  get: (meetingId: string) => http.get<MeetingDetails>(`/meetings/${meetingId}`).then((r) => r.data),
  capabilities: () => http.get<MeetingCapabilities>('/meetings/capabilities').then((r) => r.data),
  /** Downloads the meeting as a calendar file. */
  async downloadCalendar(meeting: Pick<Meeting, 'id' | 'title'>) {
    const response = await http.get<Blob>(`/meetings/${meeting.id}/calendar.ics`, { responseType: 'blob' })
    const url = URL.createObjectURL(response.data)
    const link = Object.assign(document.createElement('a'), { href: url, download: `${meeting.title.replace(/[^\w\s-]+/g, '').trim() || 'meeting'}.ics` })
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  },
  summarize: (meetingId: string) => http.post<{ summary: MeetingSummary }>(`/meetings/${meetingId}/summary`).then((r) => r.data.summary),
  uploadRecording: (meetingId: string, recordingId: string, file: Blob, durationSeconds: number, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('durationSeconds', String(durationSeconds))
    form.append('file', file, `recording.${file.type.includes('mp4') ? 'mp4' : 'webm'}`)
    return http
      .post<{ recording: MeetingRecording }>(`/meetings/${meetingId}/recordings/${recordingId}`, form, {
        timeout: 0,
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.recording)
  },
  recordingLink: (meetingId: string, recordingId: string) =>
    http.get<{ url: string }>(`/meetings/${meetingId}/recordings/${recordingId}/link`).then((r) => r.data.url),
  removeRecording: (meetingId: string, recordingId: string) => http.delete(`/meetings/${meetingId}/recordings/${recordingId}`),
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
