import { OrganizationMember, OrganizationRole, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { entitlementsFor } from '../plans/plan.service.js';
import { ALL_ORG_PERMISSIONS, ORG_PERMISSION_KEYS } from './organization-role.constants.js';

/** Human-readable list for delete/block messages: "Sony", "Sony and Alex", "Sony, Alex and 2 others". */
function formatAssigneeNames(names) {
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= 4) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return `${shown.join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

export const listOrganizationRoles = (organizationId) =>
  OrganizationRole.findAll({ where: { organizationId }, order: [['position', 'ASC'], ['name', 'ASC']] });

async function findRole(organizationId, roleId) {
  const role = await OrganizationRole.findOne({ where: { id: roleId, organizationId } });
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

function slugifyKey(name) {
  const base = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .slice(0, 40);
  if (!base || !/^[a-z]/.test(base)) return `role_${base || 'x'}`.slice(0, 40);
  return base;
}

async function uniqueKey(organizationId, preferred) {
  let key = preferred;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!(await OrganizationRole.count({ where: { organizationId, key } }))) return key;
    const suffix = `_${attempt + 2}`;
    key = `${preferred.slice(0, 40 - suffix.length)}${suffix}`;
  }
  throw ApiError.badRequest('Could not generate a unique role key');
}

function cleanPermissions(raw) {
  const unique = [...new Set((raw ?? []).filter((key) => ORG_PERMISSION_KEYS.includes(key)))];
  return unique;
}

export async function createOrganizationRole(organizationId, input) {
  const permissions = cleanPermissions(input.permissions);
  if (!permissions.length) throw ApiError.badRequest('Pick at least one permission');
  const maxPosition = await OrganizationRole.max('position', { where: { organizationId } });
  const position = Number.isFinite(maxPosition) ? maxPosition + 1 : 0;
  const key = await uniqueKey(organizationId, input.key || slugifyKey(input.name));
  try {
    return await OrganizationRole.create({
      organizationId,
      name: input.name.trim(),
      key,
      description: input.description ?? null,
      permissions,
      position,
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw ApiError.conflict('A role with that name already exists');
    }
    throw error;
  }
}

export async function updateOrganizationRole(organizationId, roleId, changes) {
  const role = await findRole(organizationId, roleId);
  const next = {};
  if (changes.name !== undefined) next.name = changes.name.trim();
  if (changes.description !== undefined) next.description = changes.description;
  if (changes.position !== undefined) next.position = changes.position;
  if (changes.permissions !== undefined) {
    const permissions = cleanPermissions(changes.permissions);
    if (!permissions.length) throw ApiError.badRequest('Pick at least one permission');
    next.permissions = permissions;
  }
  try {
    return await role.update(next);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw ApiError.conflict('A role with that name already exists');
    }
    throw error;
  }
}

export async function deleteOrganizationRole(organizationId, roleId) {
  const role = await findRole(organizationId, roleId);
  const assignees = await OrganizationMember.findAll({
    where: { organizationId, customRoleId: role.id },
    include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [[{ model: User, as: 'user' }, 'name', 'ASC']],
  });
  if (assignees.length) {
    const names = assignees.map((row) => row.user?.name || row.user?.email || 'Someone').filter(Boolean);
    const who = formatAssigneeNames(names);
    const count = assignees.length;
    throw ApiError.badRequest(
      count === 1
        ? `“${role.name}” is in use by ${who}. Open People, give them a different role (or “No custom role”), then try deleting again.`
        : `“${role.name}” is in use by ${count} people (${who}). Open People, give each of them a different role (or “No custom role”), then try deleting again.`,
      names.map((name) => ({ path: 'assignees', message: name })),
    );
  }
  await role.destroy();
}

/** Effective org permissions for a membership (+ optional preloaded custom role). */
export function permissionsForMembership(membership, customRole = null) {
  if (!membership || membership.status === 'disabled') return [];
  if (membership.role === 'admin') return [...ALL_ORG_PERMISSIONS];
  const role = customRole ?? membership.customRole ?? null;
  if (!role) return [];
  return cleanPermissions(role.permissions);
}

export function membershipHasPermission(membership, permission, customRole = null) {
  if (!ORG_PERMISSION_KEYS.includes(permission)) return false;
  return permissionsForMembership(membership, customRole).includes(permission);
}

/** Whether the org plan includes custom roles (admins still use built-in admin/member when off). */
export function customRolesEnabled(organization) {
  return Boolean(entitlementsFor(organization).features.customRoles);
}

export async function resolveMembershipPermissions(membership, organization) {
  if (!membership) return [];
  if (membership.role === 'admin') return [...ALL_ORG_PERMISSIONS];
  if (!customRolesEnabled(organization) || !membership.customRoleId) return [];
  const role =
    membership.customRole ??
    (await OrganizationRole.findOne({ where: { id: membership.customRoleId, organizationId: membership.organizationId } }));
  return permissionsForMembership(membership, role);
}
