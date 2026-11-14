import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const CHANNEL_PRIVACY = ['standard', 'private'];

/**
 * A named channel inside a team, like Microsoft Teams: `standard` channels are open to the whole team (as its
 * General chat is), `private` ones only to the people added to them. Its messages live in a `channel` conversation.
 */
export class Channel extends Model {}

Channel.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    teamId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(50), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: true },
    privacy: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'standard' },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'Channel',
    tableName: 'channels',
    indexes: [{ unique: true, fields: ['team_id', 'name'] }, { fields: ['organization_id'] }],
  },
);

/** Someone added to a private channel (standard channels follow team membership instead). */
export class ChannelMember extends Model {}

ChannelMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    channelId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
  },
  {
    sequelize,
    modelName: 'ChannelMember',
    tableName: 'channel_members',
    indexes: [{ unique: true, fields: ['channel_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);
