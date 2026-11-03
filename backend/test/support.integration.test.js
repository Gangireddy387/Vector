/*
 * The support chat between the super admin and an organization's admins, against a real, isolated backend: editing,
 * deleting for everyone, deleting for yourself and clearing the chat for yourself.
 * Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const ADMIN = { email: `root-support-${stamp}@example.test`, password: 'super-admin-password-123' };

let server;
let call;
let owner;
let root;
let portalBase;

const asOwner = (method, url, body) => call(method, url, body, owner.token, owner.organizationId);
const asRoot = (method, url, body) => call(method, `${portalBase}${url}`, body, root);
const ownerThread = async () => (await asOwner('GET', '/workspace/support')).body.messages;
const rootThread = async () => (await asRoot('GET', '')).body.messages;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const email = `owner-support-${stamp}@example.test`;
  const registered = await call('POST', '/auth/register', {
    name: 'Owner Person',
    email,
    password: 'correct-horse-battery',
    organizationName: 'Support Org',
    organizationSlug: `support-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  owner = { token: registered.body.token, organizationId: registered.body.organization.id };
  root = (await call('POST', '/auth/login', ADMIN)).body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${owner.organizationId}/approve`, null, root)).status, 200);
  portalBase = `/super-admin/organizations/${owner.organizationId}/support`;
});

after(async () => {
  await server?.stop();
});

describe('support chat', () => {
  let ownerMessage;
  let rootMessage;

  it('sends messages both ways', async () => {
    const sent = await asOwner('POST', '/workspace/support', { body: 'Please enable meetings' });
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    ownerMessage = sent.body.message;
    rootMessage = (await asRoot('POST', '', { body: 'Done, try now' })).body.message;
    assert.equal('hiddenFor' in ownerMessage, false, 'who hid a message stays on the server');
  });

  it('lets the author edit, and both sides see the change marked edited', async () => {
    const edited = await asOwner('PATCH', `/workspace/support/messages/${ownerMessage.id}`, { body: 'Please enable meetings and video calls' });
    assert.equal(edited.status, 200, JSON.stringify(edited.body));
    assert.equal(edited.body.message.body, 'Please enable meetings and video calls');
    assert.ok(edited.body.message.editedAt);
    const seen = (await rootThread()).find((message) => message.id === ownerMessage.id);
    assert.equal(seen.body, 'Please enable meetings and video calls');
    assert.ok(seen.editedAt);
  });

  it('does not let anyone edit or delete the other side’s messages', async () => {
    assert.equal((await asOwner('PATCH', `/workspace/support/messages/${rootMessage.id}`, { body: 'changed' })).status, 403);
    assert.equal((await asOwner('DELETE', `/workspace/support/messages/${rootMessage.id}`)).status, 403);
    assert.equal((await asRoot('PATCH', `/messages/${ownerMessage.id}`, { body: 'changed' })).status, 403);
  });

  it('deletes a message for me only', async () => {
    assert.equal((await asOwner('POST', `/workspace/support/messages/${rootMessage.id}/hide`)).status, 204);
    assert.equal((await ownerThread()).some((message) => message.id === rootMessage.id), false);
    assert.equal((await rootThread()).some((message) => message.id === rootMessage.id), true, 'the other side still sees it');
  });

  it('deletes a message for everyone, after which it cannot be edited', async () => {
    const deleted = await asRoot('DELETE', `/messages/${rootMessage.id}`);
    assert.equal(deleted.status, 200);
    assert.ok(deleted.body.message.deletedAt);
    assert.equal(deleted.body.message.body, '');
    assert.equal((await asRoot('PATCH', `/messages/${rootMessage.id}`, { body: 'again' })).status, 400);
  });

  it('clears the chat for me only, and new messages still arrive', async () => {
    const cleared = await asOwner('POST', '/workspace/support/clear');
    assert.equal(cleared.status, 200, JSON.stringify(cleared.body));
    assert.deepEqual(cleared.body.messages, []);
    assert.equal(cleared.body.unread, 0);
    assert.ok((await rootThread()).length >= 2, 'the other side keeps the history');

    await new Promise((resolve) => setTimeout(resolve, 20));
    await asRoot('POST', '', { body: 'Anything else?' });
    const after = await ownerThread();
    assert.deepEqual(
      after.map((message) => message.body),
      ['Anything else?'],
    );
  });
});
