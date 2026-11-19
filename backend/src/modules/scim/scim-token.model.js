import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Organization-scoped SCIM bearer tokens (vscim_…). Plaintext is shown once at create. */
export class ScimToken extends Model {}

ScimToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** First characters of the secret (for display); never enough to authenticate. */
    prefix: { type: DataTypes.STRING(16), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ScimToken',
    tableName: 'scim_tokens',
    indexes: [{ fields: ['organization_id'] }, { unique: true, fields: ['token_hash'] }],
  },
);
