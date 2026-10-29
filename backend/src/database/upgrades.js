import { DataTypes, QueryTypes } from 'sequelize';
import { config } from '../config/index.js';
import { sequelize } from './connection.js';

/** Columns added after a table was first created; `sync()` without alter does not add them. */
const ADDED_COLUMNS = [
  { table: 'users', column: 'avatar_url', definition: { type: DataTypes.STRING(255), allowNull: true } },
  { table: 'users', column: 'last_organization_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'projects', column: 'organization_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'organizations', column: 'logo_url', definition: { type: DataTypes.STRING(255), allowNull: true } },
  // Organizations that existed before approvals were introduced keep working.
  { table: 'organizations', column: 'status', definition: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'approved' } },
  { table: 'organizations', column: 'reviewed_at', definition: { type: DataTypes.DATE, allowNull: true } },
  { table: 'organizations', column: 'reviewed_by_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'organizations', column: 'rejection_reason', definition: { type: DataTypes.STRING(500), allowNull: true } },
  { table: 'organizations', column: 'plan_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'projects', column: 'team_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'project_members', column: 'via_team', definition: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false } },
  { table: 'users', column: 'about', definition: { type: DataTypes.TEXT, allowNull: true } },
  { table: 'users', column: 'location', definition: { type: DataTypes.STRING(100), allowNull: true } },
  { table: 'users', column: 'phone', definition: { type: DataTypes.STRING(40), allowNull: true } },
  { table: 'users', column: 'skills', definition: { type: DataTypes.JSON, allowNull: false, defaultValue: [] } },
  { table: 'organizations', column: 'support_disappear_hours', definition: { type: DataTypes.INTEGER, allowNull: true } },
  { table: 'support_messages', column: 'kind', definition: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'message' } },
  { table: 'support_messages', column: 'deleted_at', definition: { type: DataTypes.DATE, allowNull: true } },
  { table: 'support_messages', column: 'expires_at', definition: { type: DataTypes.DATE, allowNull: true } },
  { table: 'calendar_events', column: 'meeting_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'meetings', column: 'context_type', definition: { type: DataTypes.STRING(12), allowNull: true } },
  { table: 'meetings', column: 'context_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'meetings', column: 'recurrence', definition: { type: DataTypes.STRING(10), allowNull: true } },
  { table: 'meetings', column: 'series_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'meetings', column: 'continued', definition: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false } },
  { table: 'meetings', column: 'guest_token', definition: { type: DataTypes.STRING(64), allowNull: true } },
  { table: 'meetings', column: 'whiteboard', definition: { type: DataTypes.JSON, allowNull: true } },
  { table: 'conversation_messages', column: 'edited_at', definition: { type: DataTypes.DATE, allowNull: true } },
  { table: 'conversation_members', column: 'cleared_at', definition: { type: DataTypes.DATE, allowNull: true } },
];

/** Single-column unique constraints that became scoped to an organization. */
const DROPPED_UNIQUE = [
  { table: 'projects', column: 'key' },
  { table: 'issues', column: 'key' },
];

async function dropUniqueConstraint(table, column) {
  if (sequelize.getDialect() !== 'postgres') return;
  const rows = await sequelize.query(
    `SELECT con.conname AS name
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
      WHERE rel.relname = :table AND con.contype = 'u' AND att.attname = :column AND array_length(con.conkey, 1) = 1`,
    { replacements: { table, column }, type: QueryTypes.SELECT },
  );
  for (const { name } of rows) {
    await sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${name}"`);
    console.info(`[db] dropped unique constraint ${name}`);
  }
}

/** Idempotent, additive schema changes for existing databases. Runs before `sync()` so new indexes find their columns. */
export async function applySchemaUpgrades() {
  const queryInterface = sequelize.getQueryInterface();
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const description = await queryInterface.describeTable(table).catch(() => null);
    if (description && !description[column]) {
      await queryInterface.addColumn(table, column, definition);
      console.info(`[db] added column ${table}.${column}`);
    }
  }
  for (const { table, column } of DROPPED_UNIQUE) {
    const description = await queryInterface.describeTable(table).catch(() => null);
    if (description) await dropUniqueConstraint(table, column);
  }
}

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'workspace';

/**
 * Moves data from the single-workspace era into organizations: one organization is created from the old
 * workspace settings, existing people join it with their old role, and every project is placed in it.
 * Afterwards it only repairs gaps (projects without an organization, project members outside the organization).
 */
export async function applyDataUpgrades() {
  const { Organization, OrganizationMember, Project, ProjectMember, User, WorkspaceSetting } = await import('./models.js');

  const orphanProjects = await Project.count({ where: { organizationId: null } });
  let defaultOrganization = null;
  if (orphanProjects || !(await Organization.count())) {
    // The portal's super admin approves organizations and never needs one, so on a fresh install it must not trigger this migration.
    const users = (await User.findAll({ attributes: ['id', 'email', 'workspaceRole', 'lastOrganizationId'] })).filter(
      (user) => user.email.toLowerCase() !== config.superAdmin.email,
    );
    if (!users.length && !orphanProjects) return;
    defaultOrganization = await Organization.findOne({ order: [['createdAt', 'ASC']] });
    if (!defaultOrganization) {
      const settings = await WorkspaceSetting.findByPk(1).catch(() => null);
      const name = settings?.name ?? 'Vector';
      defaultOrganization = await Organization.create({ name, slug: slugify(name), defaultMode: settings?.defaultMode ?? 'system', status: 'approved' });
      await OrganizationMember.bulkCreate(
        users.map((user) => ({ organizationId: defaultOrganization.id, userId: user.id, role: user.workspaceRole === 'admin' ? 'admin' : 'member' })),
        { ignoreDuplicates: true },
      );
      await User.update({ lastOrganizationId: defaultOrganization.id }, { where: { lastOrganizationId: null } });
      console.info(`[db] created organization "${name}" for ${users.length} existing people`);
    }
    await Project.update({ organizationId: defaultOrganization.id }, { where: { organizationId: null } });
  }

  // Everyone in a project must belong to that project's organization.
  const [projects, projectMembers, orgMembers] = await Promise.all([
    Project.findAll({ attributes: ['id', 'organizationId'], raw: true }),
    ProjectMember.findAll({ attributes: ['projectId', 'userId'], raw: true }),
    OrganizationMember.findAll({ attributes: ['organizationId', 'userId'], raw: true }),
  ]);
  const orgOf = new Map(projects.map((project) => [project.id, project.organizationId]));
  const existing = new Set(orgMembers.map((member) => `${member.organizationId}:${member.userId}`));
  const missing = new Map();
  for (const member of projectMembers) {
    const organizationId = orgOf.get(member.projectId);
    const key = `${organizationId}:${member.userId}`;
    if (organizationId && !existing.has(key)) missing.set(key, { organizationId, userId: member.userId, role: 'member' });
  }
  if (missing.size) {
    await OrganizationMember.bulkCreate([...missing.values()], { ignoreDuplicates: true });
    console.info(`[db] added ${missing.size} project members to their organizations`);
  }
}
