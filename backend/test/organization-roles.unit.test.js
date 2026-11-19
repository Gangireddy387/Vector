import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_ORG_PERMISSIONS, ORG_PERMISSION_KEYS } from '../src/modules/organizations/organization-role.constants.js';
import { permissionsForMembership } from '../src/modules/organizations/organization-role.service.js';

describe('organization role permissions', () => {
  it('gives admins every permission', () => {
    assert.deepEqual(permissionsForMembership({ role: 'admin', status: 'active' }), ALL_ORG_PERMISSIONS);
  });

  it('gives plain members no org permissions', () => {
    assert.deepEqual(permissionsForMembership({ role: 'member', status: 'active' }), []);
  });

  it('applies a custom role permission list', () => {
    const perms = permissionsForMembership(
      { role: 'member', status: 'active' },
      { permissions: ['workspace.people', 'workspace.people', 'not-real', 'workspace.structure'] },
    );
    assert.deepEqual(perms, ['workspace.people', 'workspace.structure']);
    assert.ok(perms.every((key) => ORG_PERMISSION_KEYS.includes(key)));
  });

  it('denies disabled memberships', () => {
    assert.deepEqual(
      permissionsForMembership({ role: 'admin', status: 'disabled' }, { permissions: ['workspace.people'] }),
      [],
    );
  });
});
