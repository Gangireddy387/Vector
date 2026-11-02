import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const MEETING_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'];
export const MEETING_CONTEXTS = ['department', 'team', 'project'];
export const MEETING_RECURRENCES = ['daily', 'weekdays', 'weekly', 'monthly'];
/** Who waits in the lobby until let in: only guests, or everyone except the people running the meeting. */
export const MEETING_LOBBY_MODES = ['guests', 'everyone'];
/** An invited person's answer to the calendar invitation. */
export const MEETING_RESPONSES = ['accepted', 'tentative', 'declined'];

/** A scheduled video meeting inside an organization, with invited people and the updates they share. */
export class Meeting extends Model {}

Meeting.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    hostId: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    agenda: { type: DataTypes.TEXT, allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'scheduled' },
    /** Shared notes, kept after the meeting ends. */
    notes: { type: DataTypes.TEXT, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    /** The department, team or project the meeting is for, so their pages can show it. */
    contextType: { type: DataTypes.STRING(12), allowNull: true },
    contextId: { type: DataTypes.UUID, allowNull: true },
    /** Repeating meetings: every occurrence is its own row; they share `seriesId` (the first occurrence's id). */
    recurrence: { type: DataTypes.STRING(10), allowNull: true },
    seriesId: { type: DataTypes.UUID, allowNull: true },
    /** The next occurrence was already created from this one. */
    continued: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /** Secret part of the link that lets people outside the organization ask to join; shared by a series' occurrences. */
    guestToken: { type: DataTypes.STRING(64), allowNull: true },
    /** The shared whiteboard: `{ strokes: [...] }`. */
    whiteboard: { type: DataTypes.JSON, allowNull: true },
    /** When invited people were reminded that it starts soon. */
    remindedAt: { type: DataTypes.DATE, allowNull: true },
    /** Written from the transcript, chat and notes: `{ text, decisions: [], actionItems: [{ text, owner }], generatedAt }`. */
    summary: { type: DataTypes.JSON, allowNull: true },
    /** Who waits in the lobby (see MEETING_LOBBY_MODES). */
    lobby: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'guests' },
    /** Phone dial-in: the PIN callers enter, and the media server's routing rule for it. */
    dialInPin: { type: DataTypes.STRING(12), allowNull: true },
    sipRuleId: { type: DataTypes.STRING(80), allowNull: true },
  },
  {
    sequelize,
    modelName: 'Meeting',
    tableName: 'meetings',
    indexes: [{ fields: ['organization_id', 'starts_at'] }, { fields: ['context_id'] }, { fields: ['series_id'] }, { fields: ['guest_token'] }],
  },
);

export class MeetingParticipant extends Model {}

MeetingParticipant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    /** First time this person joined the call. */
    joinedAt: { type: DataTypes.DATE, allowNull: true },
    /** Their answer in their calendar (accepted, tentative, declined), when the host's calendar is connected. */
    response: { type: DataTypes.STRING(12), allowNull: true },
  },
  {
    sequelize,
    modelName: 'MeetingParticipant',
    tableName: 'meeting_participants',
    indexes: [{ unique: true, fields: ['meeting_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);

/** "What I worked on / what is next" style updates people post before or during the meeting. */
export class MeetingUpdate extends Model {}

MeetingUpdate.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    authorId: { type: DataTypes.UUID, allowNull: true },
    body: { type: DataTypes.TEXT, allowNull: false },
  },
  { sequelize, modelName: 'MeetingUpdate', tableName: 'meeting_updates', indexes: [{ fields: ['meeting_id', 'created_at'] }] },
);

/** A quick question asked during a call; votes are anonymous and kept with the meeting. */
export class MeetingPoll extends Model {}

MeetingPoll.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    question: { type: DataTypes.STRING(200), allowNull: false },
    /** The answers people choose from, in order. */
    options: { type: DataTypes.JSON, allowNull: false },
    /** Voter (person or guest id) → chosen answer index. */
    votes: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'open' },
  },
  { sequelize, modelName: 'MeetingPoll', tableName: 'meeting_polls', indexes: [{ fields: ['meeting_id', 'created_at'] }] },
);

/** Chat during a call, kept with the meeting. `room` is the breakout room it was sent in (null: the main room). */
export class MeetingChatMessage extends Model {}

MeetingChatMessage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    /** Who wrote it as they appeared in the call (guests have no account): `{ id, name, avatarColor, avatarUrl, title }`. */
    author: { type: DataTypes.JSON, allowNull: false },
    room: { type: DataTypes.STRING(20), allowNull: true },
    roomName: { type: DataTypes.STRING(40), allowNull: true },
    /** Sent by the host to every breakout room. */
    broadcast: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    body: { type: DataTypes.TEXT, allowNull: false },
    /** A file shared with the message: `{ id, fileName, mimeType, size }` (see MeetingFile). */
    attachment: { type: DataTypes.JSON, allowNull: true },
  },
  { sequelize, modelName: 'MeetingChatMessage', tableName: 'meeting_chat_messages', indexes: [{ fields: ['meeting_id', 'created_at'] }] },
);

/** One finished sentence of the live captions: who said it and when. */
export class MeetingTranscriptLine extends Model {}

MeetingTranscriptLine.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    speaker: { type: DataTypes.JSON, allowNull: false },
    text: { type: DataTypes.TEXT, allowNull: false },
    spokenAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'MeetingTranscriptLine', tableName: 'meeting_transcript_lines', indexes: [{ fields: ['meeting_id', 'spoken_at'] }] },
);

/**
 * One stay in the call: from joining to leaving (a reconnect or a second tab is a new row). Phone callers come from
 * the media server; guests have no account.
 */
export class MeetingAttendance extends Model {}

MeetingAttendance.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: true },
    /** member, guest or phone. */
    kind: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'member' },
    /** The connection it belongs to (socket id, or the phone caller's media-server identity). */
    sessionKey: { type: DataTypes.STRING(120), allowNull: false },
    joinedAt: { type: DataTypes.DATE, allowNull: false },
    leftAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'MeetingAttendance',
    tableName: 'meeting_attendance',
    indexes: [{ fields: ['meeting_id', 'joined_at'] }, { fields: ['meeting_id', 'session_key'] }],
  },
);

/** A file shared in the call's chat. */
export class MeetingFile extends Model {
  toJSON() {
    const { storageKey: _storageKey, ...values } = this.get();
    return values;
  }
}

MeetingFile.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    uploaderId: { type: DataTypes.UUID, allowNull: true },
    fileName: { type: DataTypes.STRING(255), allowNull: false },
    mimeType: { type: DataTypes.STRING(120), allowNull: false },
    size: { type: DataTypes.INTEGER, allowNull: false },
    storageKey: { type: DataTypes.STRING(255), allowNull: false },
  },
  { sequelize, modelName: 'MeetingFile', tableName: 'meeting_files', indexes: [{ fields: ['meeting_id'] }] },
);

/** A question for the speakers (Q&A): people upvote it, the host marks it answered. */
export class MeetingQuestion extends Model {}

MeetingQuestion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    /** As they appeared in the call (guests have no account): `{ id, name, avatarColor, avatarUrl }`. */
    author: { type: DataTypes.JSON, allowNull: false },
    text: { type: DataTypes.STRING(500), allowNull: false },
    /** Ids of the people (or guests) who upvoted. */
    voters: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    answeredAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'MeetingQuestion', tableName: 'meeting_questions', indexes: [{ fields: ['meeting_id', 'created_at'] }] },
);

export const RECORDING_STATUSES = ['recording', 'ready', 'failed'];

/** A recording of a call, made in the browser of the person who recorded it and uploaded when they stopped. */
export class MeetingRecording extends Model {}

MeetingRecording.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    createdById: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'recording' },
    storageKey: { type: DataTypes.STRING(255), allowNull: true },
    mimeType: { type: DataTypes.STRING(80), allowNull: true },
    sizeBytes: { type: DataTypes.BIGINT, allowNull: true },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, modelName: 'MeetingRecording', tableName: 'meeting_recordings', indexes: [{ fields: ['meeting_id', 'started_at'] }] },
);
