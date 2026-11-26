/*
 * Departments and teams: CRUD, visibility, project assign, UUID params.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const PASSWORD = 'correct-horse-battery';
const ADMIN = { email: `root-depts-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let member;
let project;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);

  const registered = await call('POST', '/auth/register', {
    name: 'Depts Owner',
    email: `owner-depts-${stamp}@example.test`,
    password: PASSWORD,
    organizationName: 'Depts Org',
    organizationSlug: `depts-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id, user: registered.body.user };

  const root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  // Return the invite link in the API response so the test can accept without reading mail.
  assert.equal(
    (await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { emailInvitations: false } }, root)).status,
    200,
  );

  const memberEmail = `member-depts-${stamp}@example.test`;
  const invited = await call('POST', '/workspace/invitations', { email: memberEmail, role: 'member' }, owner.token, owner.organizationId);
  assert.equal(invited.status, 201, JSON.stringify(invited.body));
  assert.ok(invited.body.member.inviteLink, 'invite link is returned when invitation emails are off');
  const inviteToken = new URL(invited.body.member.inviteLink).searchParams.get('token');
  const accepted = await call('POST', '/auth/accept-invite/quick', { token: inviteToken });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  member = { token: accepted.body.token, user: accepted.body.user };

  const created = await call('POST', '/projects', { name: 'Structure Project', key: 'DEP' }, owner.token, owner.organizationId);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  project = created.body.project ?? created.body;
});

after(async () => {
  await server?.stop();
});

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);
const asMember = (method, url, body) => call(method, url, body, member.token, owner.organizationId);

describe('departments and teams', () => {
  it('lets an admin create a department and team, and rejects duplicate names', async () => {
    const created = await asOwner('POST', '/departments', { name: 'Engineering', description: 'Builders', headId: owner.user.id });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const department = created.body.departments.find((item) => item.name === 'Engineering');
    assert.ok(department);

    const dup = await asOwner('POST', '/departments', { name: 'engineering' });
    assert.equal(dup.status, 400);

    const team = await asOwner('POST', `/departments/${department.id}/teams`, {
      name: 'Platform',
      leadId: member.user.id,
      memberIds: [member.user.id],
    });
    assert.equal(team.status, 201, JSON.stringify(team.body));
    const platform = team.body.departments.flatMap((item) => item.teams).find((item) => item.name === 'Platform');
    assert.ok(platform);
    assert.equal(platform.lead?.id, member.user.id);
  });

  it('blocks non-admins from mutating structure', async () => {
    const response = await asMember('POST', '/departments', { name: 'Shadow' });
    assert.equal(response.status, 403);
  });

  it('filters visibility for ordinary members', async () => {
    const list = await asMember('GET', '/departments');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.ok(list.body.departments.some((department) => department.teams.some((team) => team.name === 'Platform')));
    assert.ok(list.body.departments.every((department) => department.teams.every((team) => team.members.some((person) => person.id === member.user.id) || department.head?.id === member.user.id)));
  });

  it('assigns a project to a team and grants viaTeam access', async () => {
    const structure = (await asOwner('GET', '/departments')).body.departments;
    const team = structure.flatMap((item) => item.teams).find((item) => item.name === 'Platform');
    assert.ok(team);

    const assigned = await asOwner('POST', `/teams/${team.id}/projects`, { projectId: project.id });
    assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
    assert.ok(assigned.body.projects.some((item) => item.id === project.id));

    const access = await asMember('GET', `/projects/${project.id}`);
    assert.equal(access.status, 200, JSON.stringify(access.body));
  });

  it('rejects invalid UUID path params', async () => {
    const response = await asOwner('GET', '/departments/not-a-uuid/projects');
    assert.equal(response.status, 400);
  });

  it('deletes a team and leaves the project unassigned', async () => {
    const structure = (await asOwner('GET', '/departments')).body.departments;
    const team = structure.flatMap((item) => item.teams).find((item) => item.name === 'Platform');
    assert.ok(team);

    const removed = await asOwner('DELETE', `/teams/${team.id}`);
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    assert.ok(!removed.body.departments.flatMap((item) => item.teams).some((item) => item.id === team.id));

    const detail = await asOwner('GET', `/projects/${project.id}`);
    assert.equal(detail.status, 200);
    const projectBody = detail.body.project ?? detail.body;
    assert.equal(projectBody.teamId ?? null, null);
  });
});
