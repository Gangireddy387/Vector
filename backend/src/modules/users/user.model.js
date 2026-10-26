import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../database/connection.js';

const SECRET_FIELDS = ['passwordHash', 'inviteToken', 'resetToken', 'resetTokenExpiresAt'];

/** Fields that are safe to embed whenever a user is referenced (assignee, author, ...). */
export const USER_SUMMARY_ATTRIBUTES = ['id', 'name', 'email', 'avatarColor', 'avatarUrl', 'title'];

export const WORKSPACE_ROLES = ['admin', 'member'];

export const DEFAULT_USER_PREFERENCES = Object.freeze({
  emailNotifications: true,
  dailyDigest: false,
  autoTimezone: true,
});

export class User extends Model {
  toJSON() {
    const values = { ...this.get() };
    SECRET_FIELDS.forEach((field) => delete values[field]);
    return values;
  }
}

User.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    email: { type: DataTypes.STRING(190), allowNull: false, unique: true, validate: { isEmail: true } },
    passwordHash: { type: DataTypes.STRING, allowNull: true },
    status: { type: DataTypes.ENUM('active', 'invited', 'disabled'), allowNull: false, defaultValue: 'active' },
    /** Legacy single-workspace role, only read when migrating to organizations. Roles now live on organization memberships. */
    workspaceRole: { type: DataTypes.ENUM(...WORKSPACE_ROLES), allowNull: false, defaultValue: 'member' },
    /** The organization the person last worked in; opened by default after signing in. */
    lastOrganizationId: { type: DataTypes.UUID, allowNull: true },
    title: { type: DataTypes.STRING(120), allowNull: true },
    avatarColor: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '#6366f1' },
    /** Uploaded profile photo (served from /api/avatars); null shows initials on avatarColor. */
    avatarUrl: { type: DataTypes.STRING(255), allowNull: true },
    timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'UTC' },
    /** Optional profile details people fill in themselves; shown on their profile to organization admins. */
    about: { type: DataTypes.TEXT, allowNull: true },
    location: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    skills: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    preferences: { type: DataTypes.JSON, allowNull: false, defaultValue: DEFAULT_USER_PREFERENCES },
    inviteToken: { type: DataTypes.STRING, allowNull: true },
    resetToken: { type: DataTypes.STRING, allowNull: true },
    resetTokenExpiresAt: { type: DataTypes.DATE, allowNull: true },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    defaultScope: { attributes: { exclude: SECRET_FIELDS } },
    scopes: { withSecrets: { attributes: { include: SECRET_FIELDS } } },
  },
);
