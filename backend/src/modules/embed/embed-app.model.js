import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/**
 * Partner embed credentials for one organization: a public publishable key (pk_…) and a hashed secret (sk_…).
 * Partners open Vector inside their own product using a short-lived session from the secret key.
 */
export class EmbedApp extends Model {}

EmbedApp.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** Public key shown in partner frontends (pk_live_…). */
    publishableKey: { type: DataTypes.STRING(64), allowNull: false },
    /** First characters of the secret for display; never enough to authenticate. */
    secretPrefix: { type: DataTypes.STRING(20), allowNull: false },
    secretHash: { type: DataTypes.STRING(64), allowNull: false },
    enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    /**
     * Raised when keys are turned off or the secret is rotated so already-issued embed JWTs stop working.
     * Same idea as users.token_version for password changes.
     */
    sessionVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    createdById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'EmbedApp',
    tableName: 'embed_apps',
    indexes: [
      { fields: ['organization_id'] },
      { unique: true, fields: ['publishable_key'] },
      { unique: true, fields: ['secret_hash'] },
    ],
  },
);
