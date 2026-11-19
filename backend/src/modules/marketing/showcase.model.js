import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Super-admin uploaded portraits for the public auth / marketing showcase. */
export class ShowcasePortrait extends Model {}

ShowcasePortrait.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    tone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'from-sky-200 to-blue-300' },
    imageUrl: { type: DataTypes.STRING(255), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, tableName: 'showcase_portraits', underscored: true },
);
