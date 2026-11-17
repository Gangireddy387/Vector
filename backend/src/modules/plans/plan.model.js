import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** What an organization may use: feature switches plus people and project limits (null = unlimited). */
export class Plan extends Model {}

Plan.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(60), allowNull: false },
    description: { type: DataTypes.STRING(300), allowNull: true },
    /** Display label, e.g. "₹999 / month". Card checkout uses STRIPE_PRICE_PRO when configured. */
    priceLabel: { type: DataTypes.STRING(60), allowNull: true },
    maxMembers: { type: DataTypes.INTEGER, allowNull: true },
    maxProjects: { type: DataTypes.INTEGER, allowNull: true },
    features: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
    /** New organizations start on the default plan. */
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: 'Plan', tableName: 'plans' },
);
