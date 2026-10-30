import { Op } from 'sequelize';
import { OrganizationMember, User } from '../../database/models.js';
import { shared } from './shared-state.js';

/**
 * Who is available, like in Teams. A person's status follows their open app tabs (sockets):
 *   available – connected and active;  away – every open tab idle for a few minutes;
 *   in-call   – in a meeting call;     offline – no open tab (after a short grace, so a page reload does not flicker).
 * They can also choose one: busy, dnd (do not disturb), brb (be right back), away, or offline (appear offline).
 *
 * Changes are pushed at once to everyone in the person's organizations (socket room `org:<id>`), so lists, chats and
 * avatars update without reloading. State lives in the shared store, so it also works across several servers.
 */

export const PRESENCE_STATUSES = ['available', 'away', 'busy', 'dnd', 'brb', 'in-call', 'offline'];
/** What a person can choose themselves (null: automatic). */
export const CHOSEN_STATUSES = ['busy', 'dnd', 'brb', 'away', 'offline'];

const OFFLINE_GRACE_MS = 3000;
const TTL_SECONDS = 24 * 60 * 60;

const socketsKey = (userId) => `presence:sockets:${userId}`;
const stateKey = (userId) => `presence:state:${userId}`;
export const organizationRoom = (organizationId) => `org:${organizationId}`;

let ioRef = null;
const offlineTimers = new Map();

/** The status others see, from the person's open tabs and their own choice. */
export function effectiveStatus(sockets, chosen) {
  if (!sockets.length || chosen === 'offline') return 'offline';
  if (chosen === 'dnd') return 'dnd';
  const inCall = sockets.some((socket) => socket.inCall);
  if (inCall && (!chosen || chosen === 'busy')) return 'in-call';
  if (chosen) return chosen;
  return sockets.every((socket) => socket.idle) ? 'away' : 'available';
}

async function organizationsOf(userId) {
  const rows = await OrganizationMember.findAll({ where: { userId, status: 'active' }, attributes: ['organizationId'], raw: true });
  return rows.map((row) => row.organizationId);
}

/** The person's saved state: their choice, what was last announced, and when they were last seen. */
async function stateOf(userId) {
  const known = await shared.get(stateKey(userId));
  if (known) return known;
  const user = await User.findByPk(userId, { attributes: ['presenceStatus', 'lastSeenAt'] });
  return { chosen: user?.presenceStatus ?? null, status: 'offline', lastSeenAt: user?.lastSeenAt?.toISOString() ?? null };
}

const payload = (userId, state) => ({ userId, status: state.status, online: state.status !== 'offline', lastSeenAt: state.lastSeenAt, chosen: state.chosen });

async function announce(userId, state) {
  if (!ioRef) return;
  const organizations = await organizationsOf(userId);
  const message = payload(userId, state);
  for (const organizationId of organizations) ioRef.to(organizationRoom(organizationId)).emit('presence:changed', message);
  // The person's own other tabs (and the portal's super admin, who watches every organization).
  ioRef.to(`user:${userId}`).to('presence:watchers').emit('presence:changed', message);
}

/** The person's open tabs that still exist on some server (a crashed server leaves entries behind). */
async function liveSockets(userId, { forget = false } = {}) {
  const sockets = await shared.hvalues(socketsKey(userId));
  if (!sockets.length || !ioRef) return sockets;
  let live;
  try {
    live = new Set((await ioRef.in(sockets.map((socket) => socket.id)).fetchSockets()).map((socket) => socket.id));
  } catch {
    return sockets;
  }
  const gone = sockets.filter((socket) => !live.has(socket.id));
  if (forget) for (const socket of gone) await shared.hdel(socketsKey(userId), socket.id);
  return sockets.filter((socket) => live.has(socket.id));
}

/** Works out the status again and tells everyone when it changed (or always, with `force`). */
async function refresh(userId, { force = false } = {}) {
  const sockets = await liveSockets(userId, { forget: true });
  const state = await stateOf(userId);
  const status = effectiveStatus(sockets, state.chosen);
  const changed = status !== state.status;
  const next = { ...state, status };
  if (!sockets.length && (changed || !state.lastSeenAt)) {
    next.lastSeenAt = new Date().toISOString();
    await User.update({ lastSeenAt: new Date(next.lastSeenAt) }, { where: { id: userId }, silent: true }).catch(() => undefined);
  }
  await shared.set(stateKey(userId), next, TTL_SECONDS);
  if (changed || force) await announce(userId, next);
  return next;
}

const update = (userId, task) => shared.withLock(socketsKey(userId), task);

/** A tab of this person connected: they are online (and leave any pending "offline"). */
export async function presenceConnected(io, socket) {
  ioRef = io;
  const { userId } = socket.data;
  clearTimeout(offlineTimers.get(userId));
  offlineTimers.delete(userId);
  for (const organizationId of await organizationsOf(userId)) socket.join(organizationRoom(organizationId));
  await update(userId, async () => {
    await shared.hset(socketsKey(userId), socket.id, { id: socket.id, idle: false, inCall: false }, TTL_SECONDS);
    await refresh(userId);
  });
}

/** A tab closed. When it was the last one, the person goes offline after a short grace (a reload comes straight back). */
export async function presenceDisconnected(socket) {
  const { userId } = socket.data;
  const remaining = await update(userId, async () => {
    await shared.hdel(socketsKey(userId), socket.id);
    const left = (await liveSockets(userId, { forget: true })).length;
    if (left) await refresh(userId);
    return left;
  });
  if (remaining) return;
  clearTimeout(offlineTimers.get(userId));
  const timer = setTimeout(() => {
    offlineTimers.delete(userId);
    void update(userId, () => refresh(userId)).catch(() => undefined);
  }, OFFLINE_GRACE_MS);
  timer.unref?.();
  offlineTimers.set(userId, timer);
}

async function setSocketFlag(userId, socketId, changes) {
  await update(userId, async () => {
    const current = await shared.hget(socketsKey(userId), socketId);
    if (!current) return;
    await shared.hset(socketsKey(userId), socketId, { ...current, ...changes }, TTL_SECONDS);
    await refresh(userId);
  });
}

/** In a meeting call (or out of it): shown as "In a call". */
export const presenceInCall = (userId, socketId, inCall) => setSocketFlag(userId, socketId, { inCall: Boolean(inCall) });

/** The status a person chose (null: automatic again). Kept with their account, so it lasts until they change it. */
export async function choosePresence(userId, chosen) {
  const value = CHOSEN_STATUSES.includes(chosen) ? chosen : null;
  await User.update({ presenceStatus: value }, { where: { id: userId }, silent: true });
  return update(userId, async () => {
    const state = await stateOf(userId);
    await shared.set(stateKey(userId), { ...state, chosen: value }, TTL_SECONDS);
    return refresh(userId, { force: true });
  });
}

/** Current status of people the asker shares an organization with. */
export async function presenceOf(askerId, userIds) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter((id) => typeof id === 'string'))].slice(0, 500);
  if (!ids.length) return {};
  const mine = await organizationsOf(askerId);
  const visible = await OrganizationMember.findAll({
    where: { organizationId: { [Op.in]: mine }, userId: { [Op.in]: ids } },
    attributes: ['userId'],
    raw: true,
  });
  const allowed = [...new Set([askerId, ...visible.map((row) => row.userId)])].filter((id) => ids.includes(id));
  const entries = await Promise.all(
    allowed.map(async (userId) => {
      const [sockets, state] = await Promise.all([liveSockets(userId), stateOf(userId)]);
      const status = effectiveStatus(sockets, state.chosen);
      const view = { status, lastSeenAt: state.lastSeenAt };
      // Only the person themselves sees what they chose (e.g. "appear offline").
      return [userId, userId === askerId ? { ...view, chosen: state.chosen } : view];
    }),
  );
  return Object.fromEntries(entries);
}

/** Socket events: activity (idle or not), choosing a status, and asking for people's statuses. */
export function registerPresence(io, socket) {
  ioRef = io;
  const { userId } = socket.data;
  socket.on('presence:idle', ({ idle } = {}) => void setSocketFlag(userId, socket.id, { idle: Boolean(idle) }).catch(() => undefined));
  socket.on('presence:choose', async ({ status } = {}, ack) => {
    try {
      const state = await choosePresence(userId, status ?? null);
      ack?.({ ok: true, status: state.status, chosen: state.chosen });
    } catch (error) {
      ack?.({ ok: false, error: error.message });
    }
  });
  socket.on('presence:query', async ({ userIds } = {}, ack) => {
    try {
      ack?.({ ok: true, presence: await presenceOf(userId, userIds) });
    } catch (error) {
      ack?.({ ok: false, error: error.message });
    }
  });
}
