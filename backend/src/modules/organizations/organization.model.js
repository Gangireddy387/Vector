import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { COLOR_MODES } from '../workspace/workspace-setting.model.js';

export const ORGANIZATION_ROLES = ['admin', 'member'];
export const ORGANIZATION_MEMBER_STATUSES = ['active', 'disabled'];

/** A company or team using Vector. Everything (people, projects, settings) belongs to exactly one organization. */
export class Organization extends Model {}

Organization.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** The organization's address, e.g. `acme` in /o/acme. */
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    defaultMode: { type: DataTypes.ENUM(...COLOR_MODES), allowNull: false, defaultValue: 'system' },
    createdById: { type: DataTypes.UUID, allowNull: true },
    updatedById: { type: DataTypes.UUID, allowNull: true },
  },
  { sequelize, modelName: 'Organization', tableName: 'organizations' },
);

/** A person's membership in an organization. Admins manage the organization's settings and people. */
export class OrganizationMember extends Model {}

OrganizationMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organizationId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.ENUM(...ORGANIZATION_ROLES), allowNull: false, defaultValue: 'member' },
    status: { type: DataTypes.ENUM(...ORGANIZATION_MEMBER_STATUSES), allowNull: false, defaultValue: 'active' },
  },
  {
    sequelize,
    modelName: 'OrganizationMember',
    tableName: 'organization_members',
    indexes: [{ unique: true, fields: ['organization_id', 'user_id'] }, { fields: ['user_id'] }],
  },
);
