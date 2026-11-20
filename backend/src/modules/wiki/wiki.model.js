import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

export const WIKI_KINDS = ['page', 'folder'];

/** Organization-wide wiki page or folder (title + optional markdown body). */
export class WikiPage extends Model {}

WikiPage.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    /** Folder this page/folder lives in; null = root. */
    parentId: { type: DataTypes.UUID, allowNull: true },
    kind: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'page' },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    createdById: { type: DataTypes.UUID, allowNull: true },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  {
    sequelize,
    modelName: 'WikiPage',
    tableName: 'wiki_pages',
    indexes: [
      { fields: ['organization_id', 'updated_at'] },
      { fields: ['organization_id', 'parent_id', 'position'] },
    ],
  },
);

/** Snapshot of a wiki page before an edit (for version history + restore). */
export class WikiPageRevision extends Model {}

WikiPageRevision.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    pageId: { type: DataTypes.UUID, allowNull: false },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    editorId: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(150), allowNull: false },
    body: { type: DataTypes.TEXT, allowNull: false },
  },
  {
    sequelize,
    modelName: 'WikiPageRevision',
    tableName: 'wiki_page_revisions',
    updatedAt: false,
    indexes: [{ fields: ['page_id', 'created_at'] }],
  },
);
