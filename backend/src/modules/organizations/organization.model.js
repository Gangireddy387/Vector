import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';
import { COLOR_MODES } from '../workspace/workspace-setting.model.js';

export const ORGANIZATION_ROLES = ['admin', 'member'];
export const ORGANIZATION_MEMBER_STATUSES = ['active', 'disabled'];
/** New organizations wait for the super admin; only approved ones can use the portal. */
export const ORGANIZATION_STATUSES = ['pending', 'approved', 'rejected'];

/** A company or team using Vector. Everything (people, projects, settings) belongs to exactly one organization. */
export class Organization extends Model {}

Organization.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** The organization's address, e.g. `acme` in example.com/acme. */
    slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    defaultMode: { type: DataTypes.ENUM(...COLOR_MODES), allowNull: false, defaultValue: 'system' },
    logoUrl: { type: DataTypes.STRING(255), allowNull: true },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'pending', validate: { isIn: [ORGANIZATION_STATUSES] } },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedById: { type: DataTypes.UUID, allowNull: true },
    /** Shown to the organization's people when the super admin rejects it. */
    rejectionReason: { type: DataTypes.STRING(500), allowNull: true },
    /** The plan the super admin assigned; decides which features and how many people and projects it may use. */
    planId: { type: DataTypes.UUID, allowNull: true },
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
