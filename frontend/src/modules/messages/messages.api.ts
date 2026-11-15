import { http } from '@/lib/http'
import type { UserSummary } from '@/types/models'

export type ConversationKind = 'direct' | 'team' | 'department' | 'channel'
export type ChannelPrivacy = 'standard' | 'private'

/** The emojis people can react with, in the picker's order. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const

export interface MessageReaction {
  emoji: string
  userIds: string[]
}

/** A file shared in a conversation (the same shape as a file in a call's chat). */
export interface ConversationFile {
  id: string
  fileName: string
  mimeType: string
  size: number
}

/** A file as the Files tab lists it. */
export interface SharedFile extends ConversationFile {
  createdAt: string
  uploader: UserSummary | null
  messageId: string
  /** The post it was shared in (or the post of the reply it was shared in). */
  postId: string
}

export interface SavedItem {
  savedAt: string
  conversation: { id: string; kind: ConversationKind; title: string; team: { id: string; name: string } | null }
  message: ChatMessage
}

/** What the channel composer sends with the text. */
export interface ComposerExtras {
  subject: string | null
  important: boolean
  fileIds: string[]
}

/** `@[everyone](…)`: mentions everyone in a team chat or channel. */
export const EVERYONE_ID = '00000000-0000-0000-0000-000000000000'

export interface MessagePollOption {
  text: string
  votes: number
}

export interface MessagePoll {
  id: string
  messageId: string
  question: string
  options: MessagePollOption[]
  total: number
  status: 'open' | 'closed'
  createdById: string | null
  myVote: number | null
}

export interface MessageApprovalResponse {
  userId: string
  decision: 'approved' | 'rejected'
  user: UserSummary | null
}

export interface MessageApproval {
  id: string
  messageId: string
  title: string
  status: 'pending' | 'approved' | 'rejected'
  createdById: string | null
  responses: MessageApprovalResponse[]
  approved: number
  rejected: number
  myDecision: 'approved' | 'rejected' | null
}

export interface ConversationDoc {
  id: string
  conversationId: string
  title: string
  body: string
  createdById: string | null
  updatedById: string | null
  createdBy: UserSummary | null
  updatedBy: UserSummary | null
  createdAt: string
  updatedAt: string
}

export interface ChatMessage {
  id: string
  conversationId: string
  /** Team chats and channels: the post this message replies to; null for posts (and every direct message). */
  parentId: string | null
  authorId: string | null
  author: UserSummary | null
  /** Group chat posts: an optional headline. */
  subject?: string | null
  /** Group chat posts marked "Important". */
  important?: boolean
  files?: ConversationFile[]
  poll?: MessagePoll | null
  approval?: MessageApproval | null
  /** Markdown, with `@[Name](id)` mentions. */
  body: string
  /** Group chat posts pinned to the top. */
  pinnedAt?: string | null
  pinnedById?: string | null
  reactions?: MessageReaction[]
  /** Deleted for everyone by its author. */
  deletedAt: string | null
  /** Last changed by its author. */
  editedAt: string | null
  createdAt: string
}

export interface ChannelInfo {
  id: string
  name: string
  description: string | null
  privacy: ChannelPrivacy
  createdById: string | null
  /** Can rename, delete and (private channels) choose who is in it. */
  canManage: boolean
}

/** Teams-style alerts for a conversation. */
export type NotifyLevel = 'all' | 'mentions' | 'none'

/** A conversation as the list and the chat header show it. */
export interface ConversationSummary {
  id: string
  kind: ConversationKind
  title: string
  subtitle: string
  unread: number
  updatedAt: string
  /** How this person is alerted: all messages, @mentions only, or none. */
  notifyLevel?: NotifyLevel
  /** True when notifyLevel is not `all` (kept for older clients). */
  muted?: boolean
  lastMessage: { id: string; body: string; deleted: boolean; createdAt: string; author: UserSummary | null } | null
  /** Direct chats: the other person, with whether they have the app open. */
  person?: (UserSummary & { lastSeenAt: string | null; isOnline: boolean }) | null
  /** Direct chats: when the other person last read it (for read ticks). */
  otherLastReadAt?: string | null
  /** Team chats (the team's General channel) and channels: their team. */
  team?: { id: string; name: string } | null
  department?: { id: string; name: string } | null
  channel?: ChannelInfo | null
  memberCount?: number
}

export interface MessageRevision {
  id: string
  body: string
  subject: string | null
  createdAt: string
  editor: UserSummary | null
}

export interface ChannelRoster {
  privacy: ChannelPrivacy
  canManage: boolean
  members: UserSummary[]
  /** Private channels, for managers: people from the team who could be added. */
  candidates: UserSummary[]
}

export interface ChannelInput {
  teamId: string
  name: string
  description?: string | null
  privacy: ChannelPrivacy
  memberIds?: string[]
}

export const messagesApi = {
  list: () => http.get<{ conversations: ConversationSummary[] }>('/conversations').then((r) => r.data.conversations),
  openDirect: (userId: string) => http.post<{ conversation: ConversationSummary }>('/conversations/direct', { userId }).then((r) => r.data.conversation),
  /** `savedIds`: which of these messages you saved. */
  get: (conversationId: string) =>
    http.get<{ conversation: ConversationSummary; messages: ChatMessage[]; savedIds?: string[] }>(`/conversations/${conversationId}`).then((r) => r.data),
  /** `parentId`: a reply to that post; `subject` / `important`: for a post (team chats and channels); `fileIds`: uploaded files to share. */
  send: (conversationId: string, body: string, options: { parentId?: string | null; subject?: string | null; important?: boolean; fileIds?: string[] } = {}) =>
    http
      .post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages`, {
        body,
        ...(options.parentId ? { parentId: options.parentId } : {}),
        ...(options.subject ? { subject: options.subject } : {}),
        ...(options.important ? { important: true } : {}),
        ...(options.fileIds?.length ? { fileIds: options.fileIds } : {}),
      })
      .then((r) => r.data.message),
  /** Uploads a file to share in the conversation; send its id with the message. */
  upload: (conversationId: string, file: File, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.append('file', file, file.name)
    return http
      .post<{ file: ConversationFile }>(`/conversations/${conversationId}/files`, form, {
        timeout: 0,
        onUploadProgress: (event) => event.total && onProgress?.(Math.round((event.loaded / event.total) * 100)),
      })
      .then((r) => r.data.file)
  },
  fileLink: (conversationId: string, fileId: string) => http.get<{ url: string }>(`/conversations/${conversationId}/files/${fileId}/link`).then((r) => r.data.url),
  files: (conversationId: string) => http.get<{ files: SharedFile[] }>(`/conversations/${conversationId}/files`).then((r) => r.data.files),
  save: (conversationId: string, messageId: string, saved: boolean) =>
    http.post<{ messageId: string; saved: boolean }>(`/conversations/${conversationId}/messages/${messageId}/save`, { saved }).then((r) => r.data),
  saved: () => http.get<{ items: SavedItem[] }>('/conversations/saved').then((r) => r.data.items),
  markUnread: (conversationId: string, messageId: string) =>
    http.post<{ conversation: ConversationSummary }>(`/conversations/${conversationId}/unread`, { messageId }).then((r) => r.data.conversation),
  mute: (conversationId: string, muted: boolean) => http.post<{ conversation: ConversationSummary }>(`/conversations/${conversationId}/mute`, { muted }).then((r) => r.data.conversation),
  /** Teams-style: all | mentions | none. */
  setNotifyLevel: (conversationId: string, notifyLevel: NotifyLevel) =>
    http.post<{ conversation: ConversationSummary }>(`/conversations/${conversationId}/mute`, { notifyLevel }).then((r) => r.data.conversation),
  markRead: (conversationId: string) => http.post(`/conversations/${conversationId}/read`),
  /** `subject`: posts only; leave it out to keep the current one. */
  edit: (conversationId: string, messageId: string, body: string, subject?: string | null) =>
    http
      .patch<{ message: ChatMessage }>(`/conversations/${conversationId}/messages/${messageId}`, { body, ...(subject !== undefined ? { subject } : {}) })
      .then((r) => r.data.message),
  history: (conversationId: string, messageId: string) =>
    http.get<{ revisions: MessageRevision[] }>(`/conversations/${conversationId}/messages/${messageId}/history`).then((r) => r.data.revisions),
  forward: (conversationId: string, messageId: string, targetConversationId: string, note?: string) =>
    http
      .post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages/${messageId}/forward`, {
        targetConversationId,
        ...(note?.trim() ? { note: note.trim() } : {}),
      })
      .then((r) => r.data.message),
  /** Everyone who can read the conversation (for @mentions and calls). */
  people: (conversationId: string) => http.get<{ people: UserSummary[] }>(`/conversations/${conversationId}/people`).then((r) => r.data.people),
  pin: (conversationId: string, messageId: string, pinned: boolean) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/messages/${messageId}/pin`, { pinned }).then((r) => r.data.message),
  /** Adds your reaction, or takes it back. */
  react: (conversationId: string, messageId: string, emoji: string) =>
    http.post<{ messageId: string; reactions: MessageReaction[] }>(`/conversations/${conversationId}/messages/${messageId}/reactions`, { emoji }).then((r) => r.data),
  remove: (conversationId: string, messageId: string) =>
    http.delete<{ message: ChatMessage }>(`/conversations/${conversationId}/messages/${messageId}`).then((r) => r.data.message),
  /** Removes one message from your view only; returns the chat with its new last message. */
  hide: (conversationId: string, messageId: string) =>
    http.post<{ conversation: ConversationSummary }>(`/conversations/${conversationId}/messages/${messageId}/hide`).then((r) => r.data.conversation),
  /** Empties the chat for you only. */
  clear: (conversationId: string) => http.post<{ conversation: ConversationSummary }>(`/conversations/${conversationId}/clear`).then((r) => r.data.conversation),
  docs: (conversationId: string) => http.get<{ docs: ConversationDoc[] }>(`/conversations/${conversationId}/docs`).then((r) => r.data.docs),
  createDoc: (conversationId: string, input: { title: string; body?: string }) =>
    http.post<{ doc: ConversationDoc }>(`/conversations/${conversationId}/docs`, input).then((r) => r.data.doc),
  updateDoc: (conversationId: string, docId: string, input: { title?: string; body?: string }) =>
    http.patch<{ doc: ConversationDoc }>(`/conversations/${conversationId}/docs/${docId}`, input).then((r) => r.data.doc),
  removeDoc: (conversationId: string, docId: string) => http.delete(`/conversations/${conversationId}/docs/${docId}`),
  createPoll: (conversationId: string, input: { question: string; options: string[]; subject?: string | null }) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/polls`, input).then((r) => r.data.message),
  votePoll: (conversationId: string, pollId: string, optionIndex: number) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/polls/${pollId}/vote`, { optionIndex }).then((r) => r.data.message),
  closePoll: (conversationId: string, pollId: string) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/polls/${pollId}/close`).then((r) => r.data.message),
  createApproval: (conversationId: string, input: { title: string; body?: string }) =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/approvals`, input).then((r) => r.data.message),
  respondApproval: (conversationId: string, approvalId: string, decision: 'approved' | 'rejected') =>
    http.post<{ message: ChatMessage }>(`/conversations/${conversationId}/approvals/${approvalId}/respond`, { decision }).then((r) => r.data.message),
}

export const notifyLevelOf = (conversation: Pick<ConversationSummary, 'notifyLevel' | 'muted'>): NotifyLevel =>
  conversation.notifyLevel ?? (conversation.muted ? 'mentions' : 'all')

export const channelsApi = {
  create: (input: ChannelInput) => http.post<{ conversation: ConversationSummary }>('/channels', input).then((r) => r.data.conversation),
  update: (channelId: string, changes: { name?: string; description?: string | null }) =>
    http.patch<{ conversation: ConversationSummary }>(`/channels/${channelId}`, changes).then((r) => r.data.conversation),
  remove: (channelId: string) => http.delete(`/channels/${channelId}`),
  members: (channelId: string) => http.get<ChannelRoster>(`/channels/${channelId}/members`).then((r) => r.data),
  addMembers: (channelId: string, userIds: string[]) => http.post<ChannelRoster>(`/channels/${channelId}/members`, { userIds }).then((r) => r.data),
  removeMember: (channelId: string, userId: string) => http.delete<ChannelRoster | ''>(`/channels/${channelId}/members/${userId}`).then((r) => r.data || null),
}
