/*
 * One-click invitations against a real, isolated backend: "Accept" in the email sets up the account with a temporary
 * password (signed in, password returned once), which must be replaced before working.
 * Run with `node --test test/invite-accept.integration.test.js`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const ROOT = { email: `root-invite-${stamp}@example.test`, password: 'super-admin-password-123' };
const NEWBIE = `newbie-${stamp}@example.test`;

let server;
let call;
let owner;
let inviteToken;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ROOT.email, SUPER_ADMIN_PASSWORD: ROOT.password } });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'Owner Person',
    email: `owner-invite-${stamp}@example.test`,
    password: 'correct-horse-battery',
    organizationName: 'Invite Org',
    organizationSlug: `invite-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id };
  const root = (await call('POST', '/auth/login', ROOT)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  // Without invitation emails, the invite link comes back in the response (so the test can follow it).
  const features = await call('PUT', `/super-admin/organizations/${owner.organizationId}/features`, { features: { emailInvitations: false } }, root);
  assert.equal(features.status, 200, JSON.stringify(features.body));
});

after(async () => {
  await server?.stop();
});

describe('one-click invitations', () => {
  let session;

  it('invites a new person', async () => {
    const invited = await call('POST', '/workspace/invitations', { email: NEWBIE, role: 'member' }, owner.token, owner.organizationId);
    assert.equal(invited.status, 201, JSON.stringify(invited.body));
    const link = invited.body.member.inviteLink;
    assert.ok(link, 'the invite link is returned when invitations are not emailed');
    inviteToken = new URL(link).searchParams.get('token');
    assert.ok(inviteToken);
  });

  it('sets up the account in one click with a temporary password, signed in', async () => {
    const accepted = await call('POST', '/auth/accept-invite/quick', { token: inviteToken });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    session = accepted.body;
    assert.match(session.temporaryPassword, /^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    assert.ok(session.token);
    assert.equal(session.user.email, NEWBIE);
    assert.equal(session.user.mustChangePassword, true);
    assert.equal(session.organization?.id, owner.organizationId, 'they land in the inviting organization');
  });

  it('does not accept the same invitation twice', async () => {
    const again = await call('POST', '/auth/accept-invite/quick', { token: inviteToken });
    assert.equal(again.status, 400);
  });

  it('lets them sign in with the temporary password, still asked to change it', async () => {
    const login = await call('POST', '/auth/login', { email: NEWBIE, password: session.temporaryPassword });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(login.body.user.mustChangePassword, true);
  });

  it('requires a password different from the temporary one, without asking for the temporary one', async () => {
    const same = await call('PATCH', '/auth/me/password', { newPassword: session.temporaryPassword }, session.token, owner.organizationId);
    assert.equal(same.status, 400);
    const changed = await call('PATCH', '/auth/me/password', { newPassword: 'my-own-password-42' }, session.token, owner.organizationId);
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const me = await call('GET', '/auth/me', null, changed.body.token, owner.organizationId);
    assert.equal(me.body.user.mustChangePassword, false);
    assert.equal((await call('POST', '/auth/login', { email: NEWBIE, password: 'my-own-password-42' })).status, 200);
    assert.equal((await call('POST', '/auth/login', { email: NEWBIE, password: session.temporaryPassword })).status, 401, 'the temporary password stops working');
  });

  it('gives someone who never accepted a fresh invitation, and only the newest link works', async () => {
    const email = `late-${stamp}@example.test`;
    const first = await call('POST', '/workspace/invitations', { email, role: 'member' }, owner.token, owner.organizationId);
    assert.equal(first.status, 201, JSON.stringify(first.body));
    const oldToken = new URL(first.body.member.inviteLink).searchParams.get('token');
    const resent = await call('POST', `/workspace/members/${first.body.member.id}/resend-invitation`, null, owner.token, owner.organizationId);
    assert.equal(resent.status, 200, JSON.stringify(resent.body));
    const newToken = new URL(resent.body.inviteLink).searchParams.get('token');
    assert.notEqual(newToken, oldToken);
    assert.equal((await call('POST', '/auth/accept-invite/quick', { token: oldToken })).status, 400, 'the old link stops working');

    // Adding them to a project while still invited sends a fresh invitation too (not "you were added").
    const project = await call('POST', '/projects', { name: 'Late Project', key: `LT${stamp.slice(-3).toUpperCase().replace(/[^A-Z]/g, 'X')}`, type: 'kanban' }, owner.token, owner.organizationId);
    assert.equal(project.status, 201, JSON.stringify(project.body));
    const projectId = (project.body.project ?? project.body).id;
    const added = await call('POST', `/projects/${projectId}/members`, { email, role: 'member' }, owner.token, owner.organizationId);
    assert.equal(added.status, 201, JSON.stringify(added.body));
    const addedBody = added.body.member ?? added.body;
    assert.equal(addedBody.invited, true);
    const projectToken = new URL(addedBody.inviteLink).searchParams.get('token');
    const accepted = await call('POST', '/auth/accept-invite/quick', { token: projectToken });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const joined = await call('POST', `/workspace/members/${first.body.member.id}/resend-invitation`, null, owner.token, owner.organizationId);
    assert.equal(joined.status, 400, 'nothing to resend once they joined');
  });

  it('still asks everyone else for their current password', async () => {
    const withoutCurrent = await call('PATCH', '/auth/me/password', { newPassword: 'another-password-77' }, owner.token, owner.organizationId);
    assert.equal(withoutCurrent.status, 400);
  });
});
