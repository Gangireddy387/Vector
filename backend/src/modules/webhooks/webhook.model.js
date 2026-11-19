import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Organization outbound webhook endpoint (Vector → customer HTTPS URL). */
export class WebhookEndpoint extends Model {}

WebhookEndpoint.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    url: { type: DataTypes.STRING(2000), allowNull: false },
    /** First characters of the signing secret (for display). */
    secretPrefix: { type: DataTypes.STRING(20), allowNull: false },
    /** AES-GCM encrypted signing secret (needed to HMAC outbound bodies). */
    secretEncrypted: { type: DataTypes.TEXT, allowNull: false },
    /** Subscribed event type strings from WEBHOOK_EVENTS. */
    events: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastDeliveryAt: { type: DataTypes.DATE, allowNull: true },
    lastStatus: { type: DataTypes.INTEGER, allowNull: true },
    lastError: { type: DataTypes.STRING(500), allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'WebhookEndpoint',
    tableName: 'webhook_endpoints',
    indexes: [{ fields: ['organization_id'] }],
  },
);
