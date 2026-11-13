/*
 * Custom ringtones, against a real, isolated backend: uploading needs the custom sounds plan feature, only real audio
 * files are accepted, the file is served publicly by its unguessable name, and replacing or removing it deletes the
 * old file. Run with `npm run test:integration`. Everything here is created by the test itself.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { apiClient, startIsolatedServer } from './helpers/isolated-server.js';

const stamp = Date.now().toString(36);
const ADMIN = { email: `root-tones-${stamp}@example.test`, password: 'portal-owner-password-123' };

let server;
let call;
let alice;
let rootToken;

/** A tiny but valid WAV file: 0.1 s of silence. */
function wav() {
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(samples * 2, 40);
  return buffer;
}

async function upload(bytes, fileName, type) {
  const form = new FormData();
  form.append('ringtone', new Blob([bytes], { type }), fileName);
  const response = await fetch(`${server.api}/users/me/ringtone`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${alice.token}`, 'X-Organization-Id': alice.organizationId },
    body: form,
  });
  return { status: response.status, body: await response.json() };
}

const asAlice = (method, url, body) => call(method, url, body, alice.token, alice.organizationId);
const fileStatus = async (url) => (await fetch(`${server.base}${url}`)).status;

before(async () => {
  server = await startIsolatedServer({ env: { SUPER_ADMIN_EMAIL: ADMIN.email, SUPER_ADMIN_PASSWORD: ADMIN.password } });
  call = apiClient(server.api);
  const registered = await call('POST', '/auth/register', {
    name: 'Alice Person',
    email: `alice-tones-${stamp}@example.test`,
    password: 'correct-horse-battery',
    organizationName: 'Ringing Org',
    organizationSlug: `ringing-${stamp}`,
  });
  assert.equal(registered.status, 201, JSON.stringify(registered.body));
  alice = { token: registered.body.token, organizationId: registered.body.organization.id };
  const root = await call('POST', '/auth/login', ADMIN);
  rootToken = root.body.token;
  assert.equal((await call('POST', `/super-admin/organizations/${alice.organizationId}/approve`, null, rootToken)).status, 200);
});

after(async () => {
  await server?.stop();
});

describe('custom ringtones', () => {
  let firstUrl;

  it('needs the custom sounds plan feature', async () => {
    const refused = await upload(wav(), 'Morning.wav', 'audio/wav');
    assert.equal(refused.status, 403, JSON.stringify(refused.body));
    assert.equal(refused.body.code ?? refused.body.details?.code, 'plan_feature');
    const enabled = await call('PUT', `/super-admin/organizations/${alice.organizationId}/features`, { features: { customSounds: true } }, rootToken);
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
  });

  it('accepts an audio file, selects it and serves it by its unguessable name', async () => {
    const uploaded = await upload(wav(), 'Morning song.wav', 'audio/wav');
    assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
    const sounds = uploaded.body.user.preferences.sounds;
    assert.equal(sounds.ringtone, 'custom');
    assert.equal(sounds.customRingtoneName, 'Morning song');
    assert.match(sounds.customRingtoneUrl, /^\/api\/ringtones\/[a-f0-9-]{36}\.wav$/);
    firstUrl = sounds.customRingtoneUrl;
    const served = await fetch(`${server.base}${firstUrl}`);
    assert.equal(served.status, 200);
    assert.match(served.headers.get('content-type') ?? '', /audio/);
  });

  it('rejects files that are not audio, whatever their name says', async () => {
    const rejected = await upload(Buffer.from('definitely not an mp3 file, just text'), 'tone.mp3', 'audio/mpeg');
    assert.equal(rejected.status, 400, JSON.stringify(rejected.body));
  });

  it('keeps the uploaded file when other sound choices change, and ignores a URL sent from the browser', async () => {
    const changed = await asAlice('PATCH', '/auth/me', { preferences: { sounds: { ringtone: 'echo', customRingtoneUrl: 'https://example.com/x.mp3' } } });
    assert.equal(changed.status, 200, JSON.stringify(changed.body));
    const sounds = changed.body.user.preferences.sounds;
    assert.equal(sounds.ringtone, 'echo');
    assert.equal(sounds.customRingtoneUrl, firstUrl);
  });

  it('deletes the old file when the tone is replaced, and the new one when removed', async () => {
    const replaced = await upload(wav(), 'Evening.wav', 'audio/wav');
    assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
    const secondUrl = replaced.body.user.preferences.sounds.customRingtoneUrl;
    assert.notEqual(secondUrl, firstUrl);
    assert.equal(await fileStatus(firstUrl), 404);

    const removed = await asAlice('DELETE', '/users/me/ringtone');
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    const sounds = removed.body.user.preferences.sounds;
    assert.equal(sounds.customRingtoneUrl, null);
    assert.equal(sounds.ringtone, 'default');
    assert.equal(await fileStatus(secondUrl), 404);
  });
});
