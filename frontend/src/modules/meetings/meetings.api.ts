import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export type MeetingStatus = 'scheduled' | 'live' | 'ended' | 'cancelled'
export type MeetingRecurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly'

export interface MeetingContext {
  type: 'department' | 'team' | 'project'
  id: string
}

/** A reply to the invitation, from the host's connected Google or Microsoft calendar. */
export type MeetingResponse = 'accepted' | 'tentative' | 'declined'

/** Who waits in the lobby until someone lets them in: only guests, or everyone except the host and co-hosts. */
export type MeetingLobby = 'guests' | 'everyone'

export interface MeetingParticipant extends UserSummary {
  joinedAt: string | null
  lastSeenAt: string | null
  isOnline: boolean
  response: MeetingResponse | null
}

export interface MeetingDialIn {
  number: string
  pin: string
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
  lobby: MeetingLobby
  /** Joining by phone (when the server has dial-in). */
  dialIn: MeetingDialIn | null
  /** The host's Google or Microsoft calendar carries this meeting: invitations and replies go through it. */
  calendarSync: { provider: CalendarProvider; lastSyncedAt: string | null } | null
}

export type CalendarProvider = 'google' | 'microsoft'

export interface MeetingActionItem {
  text: string
  owner: string | null
  /** The invited person the owner's name matched. */
  ownerId?: string | null
  due?: string | null
  priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest' | null
  /** The task it became. */
  issue?: { id: string; key: string; projectId: string } | null
}

export interface MeetingSummary {
  text: string
  decisions: string[]
  actionItems: MeetingActionItem[]
  /** Topics of the call and when each started. */
  chapters?: Array<{ at: string; title: string }>
  generatedAt: string
}

export interface MeetingSearchResult {
  meeting: { id: string; title: string; startsAt: string; status: MeetingStatus }
  kind: 'transcript' | 'summary' | 'chat' | 'notes' | 'agenda'
  text: string
  at: string | null
  score: number
}

export interface TimeSuggestion {
  startsAt: string
  endsAt: string
  everyoneWorking: boolean
  /** People for whom it is outside working hours. */
  outside: string[]
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
  attachment: MeetingFile | null
}

/** A file shared in the call's chat. */
export interface MeetingFile {
  id: string
  fileName: string
  mimeType: string
  size: number
}

/** A question asked during the call (Q&A); `voters`: who upvoted it. */
export interface MeetingQuestion {
  id: string
  author: { id: string; name: string; avatarUrl?: string | null; avatarColor?: string | null; guest?: boolean }
  text: string
  voters: string[]
  votes: number
  answeredAt: string | null
  /** The host's written answer. */
  answer: string | null
  createdAt: string
}

/** One person in the attendance report: all their stays in the call added up. */
export interface AttendanceEntry {
  key: string
  userId: string | null
  name: string
  email: string | null
  kind: 'member' | 'guest' | 'phone'
  firstJoinedAt: string
  lastLeftAt: string | null
  seconds: number
  sessions: number
  inCall: boolean
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
  fileMaxMb: number
  /** People can join calls by phone. */
  dialIn: boolean
  /** The AI assistant: notes from speech, translated captions, catch-up, agendas, meaning-based search. */
  ai: boolean
}

export interface MeetingDetails {
  meeting: Meeting
  updates: MeetingUpdate[]
  polls: MeetingPoll[]
  whiteboard: { strokes: WhiteboardStroke[] } | null
  chat: SavedChatMessage[]
  transcript: TranscriptLine[]
  recordings: MeetingRecording[]
  questions: MeetingQuestion[]
  files: MeetingFile[]
  /** Only for the host and organization admins. */
  attendance: AttendanceEntry[] | null
}

export interface CalendarConnectionInfo {
  provider: CalendarProvider
  label: string
  /** The server has this calendar set up. */
  available: boolean
  connection: { provider: CalendarProvider; accountEmail: string | null; connectedAt: string; needsReconnect: boolean } | null
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

/** Freehand paths are drawn; shapes have two corners; text and sticky notes one position and their words. */
export type WhiteboardKind = 'path' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'text' | 'note'

export interface WhiteboardStroke {
  id: string
  owner: string
  /** Missing on boards drawn before shapes existed: a freehand path. */
  kind?: WhiteboardKind
  color: string
  width: number
  tool: 'pen' | 'highlighter'
  /** [x, y, x, y…] between 0 and 1 of the board. */
  points: number[]
  text?: string
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
  lobby?: MeetingLobby
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
  attendance: (meetingId: string) => http.get<{ attendance: AttendanceEntry[] }>(`/meetings/${meetingId}/attendance`).then((r) => r.data.attendance),
  /** Shares a file in the call's chat: upload first, then send the message with its id. */
  uploadFile: (meetingId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return http
      .post<{ file: MeetingFile }>(`/meetings/${meetingId}/files`, form, {
        timeout: 0,
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.file)
  },
  fileLink: (meetingId: string, fileId: string) => http.get<{ url: string }>(`/meetings/${meetingId}/files/${fileId}/link`).then((r) => r.data.url),
  /** What was said and written in meetings; `mode` 'meaning' when the AI assistant searched by meaning. */
  search: (q: string) => http.get<{ mode: 'meaning' | 'words'; results: MeetingSearchResult[] }>('/meetings/search', { params: { q } }).then((r) => r.data),
  draftAgenda: (input: { title?: string; durationMinutes?: number; contextType?: MeetingContext['type'] | null; contextId?: string | null; meetingId?: string | null; seriesId?: string | null }) =>
    http.post<{ agenda: string; source: 'ai' | 'basic' }>('/meetings/agenda-draft', input, { timeout: 60_000 }).then((r) => r.data),
  suggestTimes: (input: { participantIds: string[]; durationMinutes: number; from?: string; days?: number }) =>
    http.post<{ people: number; checkedCalendars: number; suggestions: TimeSuggestion[] }>('/meetings/suggest-times', input, { timeout: 30_000 }).then((r) => r.data),
  createTasks: (
    meetingId: string,
    input: { projectId: string; items: Array<{ index: number; title: string; assigneeId: string | null; dueDate: string | null; priority: MeetingActionItem['priority'] }> },
  ) =>
    http
      .post<{ summary: MeetingSummary; created: Array<{ index: number; key: string; id: string }>; unassigned: string[] }>(`/meetings/${meetingId}/action-items/tasks`, input)
      .then((r) => r.data),
}

/** Your Google or Microsoft calendar, connected to Vector so meetings appear there and replies come back. */
export const calendarSyncApi = {
  list: () => http.get<{ calendars: CalendarConnectionInfo[] }>('/calendar-sync/connections').then((r) => r.data.calendars),
  connect: (provider: CalendarProvider) => http.post<{ url: string }>(`/calendar-sync/${provider}/connect`).then((r) => r.data.url),
  disconnect: (provider: CalendarProvider) => http.delete(`/calendar-sync/${provider}`),
}
