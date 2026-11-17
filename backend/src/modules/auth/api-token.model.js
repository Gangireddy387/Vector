import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Personal access tokens for scripting against the API (Bearer vtk_…). Plaintext is shown once at create. */
export class ApiToken extends Model {}

ApiToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** First 8 chars of the secret (for display); never enough to authenticate. */
    prefix: { type: DataTypes.STRING(16), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    lastUsedAt: { type: DataTypes.DATE, allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'ApiToken',
    tableName: 'api_tokens',
    indexes: [{ fields: ['user_id'] }, { unique: true, fields: ['token_hash'] }],
  },
);
