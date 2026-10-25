import { DataTypes, QueryTypes } from 'sequelize';
import { sequelize } from './connection.js';

/** Columns added after a table was first created; `sync()` without alter does not add them. */
const ADDED_COLUMNS = [
  { table: 'users', column: 'avatar_url', definition: { type: DataTypes.STRING(255), allowNull: true } },
  { table: 'users', column: 'last_organization_id', definition: { type: DataTypes.UUID, allowNull: true } },
  { table: 'projects', column: 'organization_id', definition: { type: DataTypes.UUID, allowNull: true } },
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
    const users = await User.findAll({ attributes: ['id', 'workspaceRole', 'lastOrganizationId'] });
    if (!users.length && !orphanProjects) return;
    defaultOrganization = await Organization.findOne({ order: [['createdAt', 'ASC']] });
    if (!defaultOrganization) {
      const settings = await WorkspaceSetting.findByPk(1).catch(() => null);
      const name = settings?.name ?? 'Vector';
      defaultOrganization = await Organization.create({ name, slug: slugify(name), defaultMode: settings?.defaultMode ?? 'system' });
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
