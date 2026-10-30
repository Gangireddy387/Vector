/* End-to-end check of live presence against a running backend (npm run dev): two members of one organization, one
   watches the other become available, away, in "do not disturb" and offline, without reloading anything. */
import { createRequire } from 'node:module';
import { OrganizationMember, User } from '../src/database/models.js';
import { signAccessToken } from '../src/modules/auth/token.js';

const require = createRequire(import.meta.url);
const { io } = require('../../frontend/node_modules/socket.io-client');
const BASE = process.env.API_URL ?? 'http://localhost:4000';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const connect = (token) =>
  new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
const ask = (socket, event, payload = {}) => new Promise((resolve) => socket.timeout(5000).emit(event, payload, (error, response) => resolve(error ? { ok: false } : response)));
/** The next presence change about `userId` that matches `status`. */
const changeOf = (socket, userId, status, ms = 8000) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off('presence:changed', listener);
      resolve(null);
    }, ms);
    const listener = (event) => {
      if (event.userId !== userId || event.status !== status) return;
      clearTimeout(timer);
      socket.off('presence:changed', listener);
      resolve(event);
    };
    socket.on('presence:changed', listener);
  });

// The person watched must have no app open anywhere (their own tabs would keep them online): a temporary member.
const watcherMembership = await OrganizationMember.findOne({ where: { status: 'active' }, raw: true, order: [['createdAt', 'ASC']] });
if (!watcherMembership) {
  console.log('Need an organization with an active member.');
  process.exit(1);
}
const temporary = await User.create({ name: 'Presence Test', email: `presence-test-${Date.now()}@example.test`, avatarColor: '#0ea5e9' });
await OrganizationMember.create({ organizationId: watcherMembership.organizationId, userId: temporary.id, role: 'member', status: 'active' });
const pair = { watcher: watcherMembership.userId, person: temporary.id };

const sockets = [];
try {
  const watcher = await connect(signAccessToken({ id: pair.watcher, email: 'watcher@test' }));
  sockets.push(watcher);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const cameOnline = changeOf(watcher, pair.person, 'available');
  const person = await connect(signAccessToken({ id: pair.person, email: 'person@test' }));
  sockets.push(person);
  await ask(person, 'presence:choose', { status: null });
  check('others see someone come online at once', Boolean(await cameOnline));

  const queried = await ask(watcher, 'presence:query', { userIds: [pair.person] });
  check('status can be asked for', queried.ok && queried.presence?.[pair.person]?.status === 'available', JSON.stringify(queried.presence));

  const away = changeOf(watcher, pair.person, 'away');
  person.emit('presence:idle', { idle: true });
  check('idle shows as away', Boolean(await away));
  const back = changeOf(watcher, pair.person, 'available');
  person.emit('presence:idle', { idle: false });
  check('activity shows as available again', Boolean(await back));

  const dnd = changeOf(watcher, pair.person, 'dnd');
  const chose = await ask(person, 'presence:choose', { status: 'dnd' });
  check('a chosen status reaches others', chose.ok && Boolean(await dnd));
  const ghost = changeOf(watcher, pair.person, 'offline');
  await ask(person, 'presence:choose', { status: 'offline' });
  check('appear offline looks offline to others', Boolean(await ghost));
  const auto = changeOf(watcher, pair.person, 'available');
  await ask(person, 'presence:choose', { status: null });
  check('resetting goes back to automatic', Boolean(await auto));

  const secondTab = await connect(signAccessToken({ id: pair.person, email: 'person@test' }));
  sockets.push(secondTab);
  let flicker = false;
  const flickerListener = (event) => event.userId === pair.person && event.status === 'offline' && (flicker = true);
  watcher.on('presence:changed', flickerListener);
  person.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 4000));
  watcher.off('presence:changed', flickerListener);
  check('closing one of two tabs keeps them online', !flicker);

  const started = Date.now();
  const offline = changeOf(watcher, pair.person, 'offline');
  secondTab.disconnect();
  const event = await offline;
  const seconds = (Date.now() - started) / 1000;
  check('closing the last tab shows offline within seconds', Boolean(event) && seconds < 6, `${seconds.toFixed(1)} s`);
  check('offline comes with "last seen"', Boolean(event?.lastSeenAt));
} catch (error) {
  check('no unexpected error', false, error.message);
} finally {
  sockets.forEach((socket) => socket.connected && socket.disconnect());
  await new Promise((resolve) => setTimeout(resolve, 500));
  await OrganizationMember.destroy({ where: { userId: temporary.id } });
  await temporary.destroy();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
