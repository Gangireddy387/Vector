import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const CALENDAR_PROVIDERS = ['google', 'microsoft'];

/**
 * A person's connected Google or Microsoft 365 calendar. The tokens are stored encrypted (see calendar-sync/crypto.js)
 * and never leave the server.
 */
export class CalendarConnection extends Model {
  toJSON() {
    const { accessToken: _accessToken, refreshToken: _refreshToken, ...values } = this.get();
    return values;
  }
}

CalendarConnection.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(12), allowNull: false },
    accountEmail: { type: DataTypes.STRING(190), allowNull: true },
    accessToken: { type: DataTypes.TEXT, allowNull: false },
    refreshToken: { type: DataTypes.TEXT, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
    /** Set when the provider refused the stored sign-in (revoked access): the person has to connect again. */
    brokenAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'CalendarConnection', tableName: 'calendar_connections', indexes: [{ unique: true, fields: ['user_id', 'provider'] }] },
);

/** The event a meeting has in its host's connected calendar (the calendar sends the invitations and collects replies). */
export class MeetingCalendarLink extends Model {}

MeetingCalendarLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    meetingId: { type: DataTypes.UUID, allowNull: false },
    connectionId: { type: DataTypes.UUID, allowNull: false },
    provider: { type: DataTypes.STRING(12), allowNull: false },
    externalId: { type: DataTypes.STRING(255), allowNull: false },
    /** The start and end the calendar had at the last sync, to notice when someone moves it there. */
    syncedStart: { type: DataTypes.DATE, allowNull: true },
    syncedEnd: { type: DataTypes.DATE, allowNull: true },
    lastSyncedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, modelName: 'MeetingCalendarLink', tableName: 'meeting_calendar_links', indexes: [{ unique: true, fields: ['meeting_id'] }] },
);
