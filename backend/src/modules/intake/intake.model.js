import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from '../issues/issue.model.js';

export const DEFAULT_INTAKE_SETTINGS = Object.freeze({
  /** Collect a longer description from the submitter. */
  askDescription: true,
  /** Let the submitter pick priority (otherwise the form default is used). */
  askPriority: false,
});

/**
 * Public request form for a project: anyone with the token can submit work without an account.
 */
export class IntakeForm extends Model {}

IntakeForm.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    token: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    projectId: { type: DataTypes.UUID, allowNull: false },
    /** Heading on the public page. */
    title: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Submit a request' },
    /** Optional intro shown above the fields. */
    intro: { type: DataTypes.TEXT, allowNull: true },
    issueType: { type: DataTypes.ENUM(...ISSUE_TYPES.filter((type) => type !== 'epic' && type !== 'subtask')), allowNull: false, defaultValue: 'task' },
    defaultPriority: { type: DataTypes.ENUM(...ISSUE_PRIORITIES), allowNull: false, defaultValue: 'medium' },
    settings: { type: DataTypes.JSON, allowNull: false, defaultValue: DEFAULT_INTAKE_SETTINGS },
    createdById: { type: DataTypes.UUID, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'IntakeForm',
    tableName: 'intake_forms',
    indexes: [{ fields: ['token'], unique: true }, { fields: ['project_id'] }, { fields: ['organization_id'] }],
  },
);
