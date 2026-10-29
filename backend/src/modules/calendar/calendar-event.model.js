import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const EVENT_CATEGORIES = ['meeting', 'call', 'review', 'planning', 'focus', 'interview', 'personal', 'other'];
export const EVENT_STATUSES = ['planned', 'done', 'cancelled'];

/** One entry in a person's own calendar. Dates and times are the owner's local wall-clock values. */
export class CalendarEvent extends Model {}

CalendarEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    ownerId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    allDay: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    /** `HH:mm`; both empty for all-day events. */
    startTime: { type: DataTypes.STRING(5), allowNull: true },
    endTime: { type: DataTypes.STRING(5), allowNull: true },
    category: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'meeting' },
    location: { type: DataTypes.STRING(300), allowNull: true },
    projectId: { type: DataTypes.UUID, allowNull: true },
    status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'planned' },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    /** Shared by the copies created when an event repeats. */
    seriesId: { type: DataTypes.UUID, allowNull: true },
    /** Added by a meeting invitation; it moves or disappears with the meeting. */
    meetingId: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'CalendarEvent',
    tableName: 'calendar_events',
    indexes: [{ fields: ['organization_id', 'owner_id', 'date'] }, { fields: ['series_id'] }],
  },
);
