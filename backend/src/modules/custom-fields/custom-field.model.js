import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

/** Field types supported on issues. */
export const CUSTOM_FIELD_TYPES = ['text', 'number', 'date', 'select', 'multi_select', 'checkbox', 'url'];

export class CustomField extends Model {}

CustomField.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** Stable slug used in APIs and activity; unique per project. */
    key: { type: DataTypes.STRING(40), allowNull: false },
    type: { type: DataTypes.ENUM(...CUSTOM_FIELD_TYPES), allowNull: false, defaultValue: 'text' },
    /** Option labels for select / multi_select. */
    options: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: 'CustomField',
    tableName: 'custom_fields',
    indexes: [
      { unique: true, fields: ['project_id', 'key'] },
      { unique: true, fields: ['project_id', 'name'] },
      { fields: ['project_id', 'position'] },
    ],
  },
);

export class IssueCustomFieldValue extends Model {}

IssueCustomFieldValue.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    issueId: { type: DataTypes.UUID, allowNull: false },
    fieldId: { type: DataTypes.UUID, allowNull: false },
    /** Typed JSON: string | number | boolean | string[] | null */
    value: { type: DataTypes.JSON, allowNull: true },
  },
  {
    sequelize,
    modelName: 'IssueCustomFieldValue',
    tableName: 'issue_custom_field_values',
    indexes: [{ unique: true, fields: ['issue_id', 'field_id'] }],
  },
);
