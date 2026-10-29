import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** A browser or installed app that agreed to show this person's notifications (Web Push). */
export class PushSubscription extends Model {}

PushSubscription.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    endpoint: { type: DataTypes.TEXT, allowNull: false },
    p256dh: { type: DataTypes.STRING(255), allowNull: false },
    auth: { type: DataTypes.STRING(255), allowNull: false },
    userAgent: { type: DataTypes.STRING(255), allowNull: true },
  },
  { sequelize, modelName: 'PushSubscription', tableName: 'push_subscriptions', indexes: [{ unique: true, fields: ['endpoint'] }, { fields: ['user_id'] }] },
);
