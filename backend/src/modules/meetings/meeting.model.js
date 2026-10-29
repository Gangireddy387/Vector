import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const MEETING_STATUSES = ['scheduled', 'live', 'ended', 'cancelled'];
export const MEETING_CONTEXTS = ['department', 'team', 'project'];

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
  },
  { sequelize, modelName: 'Meeting', tableName: 'meetings', indexes: [{ fields: ['organization_id', 'starts_at'] }, { fields: ['context_id'] }] },
);

export class MeetingParticipant extends Model {}

MeetingParticipant.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    /** First time this person joined the call. */
    joinedAt: { type: DataTypes.DATE, allowNull: true },
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
