import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Organization-wide wiki page (title + markdown body). */
export class WikiPage extends Model {}

WikiPage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    createdById: { type: DataTypes.UUID, allowNull: true },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'WikiPage',
    tableName: 'wiki_pages',
    indexes: [{ fields: ['organization_id', 'updated_at'] }],
  },
);
