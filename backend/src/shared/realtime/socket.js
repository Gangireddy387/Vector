import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { config } from '../../config/index.js';
import { User } from '../../database/models.js';
import { isAccessToken, isRevoked, TOKEN_TYPES, verifyAccessToken } from '../../modules/auth/token.js';
import { isUuid } from '../utils/ids.js';
import { relayConfigured } from '../../modules/meetings/ice-servers.js';
import { registerMeetingCollab } from '../../modules/meetings/meeting.collab.js';
import { registerMeetingAi } from '../../modules/meetings/meeting.ai.js';
import { registerMeetingPhone } from '../../modules/meetings/meeting.phone.js';
import { registerMeetingQa } from '../../modules/meetings/meeting.qa.js';
import { registerMeetingSignaling } from '../../modules/meetings/meeting.signaling.js';
import { canWatchProject } from '../../modules/projects/project-access.js';
import { presenceConnected, presenceDisconnected, registerPresence } from './presence.js';

let io = null;

/** Open app connections per person (several tabs count once); someone with at least one is online. */
const connections = new Map();
export const isUserOnline = (userId) => (connections.get(userId) ?? 0) > 0;

let superAdminId;
async function superAdminUserId() {
  if (superAdminId === undefined && config.superAdmin.email) {
    superAdminId = (await User.findOne({ where: { email: config.superAdmin.email }, attributes: ['id'], raw: true }))?.id ?? null;
  }
  return superAdminId ?? null;
}

/**
 * Every event handler of the socket is guarded: a handler that throws (or whose promise rejects) is logged and its
 * acknowledgement answered, instead of crashing the server for everyone.
 */
function guardHandlers(socket) {
  const on = socket.on.bind(socket);
  socket.on = (event, handler) =>
    on(event, (...args) => {
      const fail = (error) => {
        console.error(`[socket] "${event}" failed:`, error?.message ?? error);
        const ack = args.at(-1);
        if (typeof ack === 'function') ack({ ok: false, error: 'Something went wrong. Try again.' });
      };
      try {
        const result = handler(...args);
        if (result && typeof result.catch === 'function') result.catch(fail);
      } catch (error) {
        fail(error);
      }
    });
}

/** `redis`: the clients from `initSharedState()`; with them, messages reach people connected to any backend server. */
export function initRealtime(httpServer, redis = null) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrl.split(','), credentials: true },
    // A connection that dies without closing (Wi-Fi off, laptop asleep) is noticed within ~18 s, so presence goes offline.
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  if (redis) io.adapter(createAdapter(redis.client, redis.subscriber, { key: `${config.redis.prefix}socket.io` }));
  if (!relayConfigured()) {
    console.warn('[meetings] no TURN relay configured: video calls fail on networks that block direct connections (see TURN_* in .env.example)');
  }

  /**
   * Only sign-in tokens of active accounts (not revoked by a password change) and meeting guest passes connect;
   * other tokens (recording links…) are refused.
   */
  io.use((socket, next) => {
    void (async () => {
      const payload = verifyAccessToken(socket.handshake.auth?.token);
      // Guests (meeting guest link) only take part in the one call their pass is for.
      if (payload.typ === TOKEN_TYPES.guest) {
        socket.data.guest = { id: `guest:${payload.gid}`, name: payload.name, meetingId: payload.mid };
        return next();
      }
      if (!isAccessToken(payload)) throw new Error('wrong token type');
      const user = await User.findByPk(payload.sub, { attributes: ['id', 'status', 'tokenVersion'] });
      if (!user || user.status !== 'active' || isRevoked(payload, user)) throw new Error('inactive');
      socket.data.userId = user.id;
      next();
    })().catch(() => next(new Error('unauthorized')));
  });

  io.on('connection', (socket) => {
    guardHandlers(socket);
    registerMeetingSignaling(io, socket);
    registerMeetingCollab(io, socket);
    registerMeetingQa(io, socket);
    registerMeetingAi(io, socket);
    registerMeetingPhone(io, socket);
    if (socket.data.guest) return;

    const { userId } = socket.data;
    socket.join(`user:${userId}`);
    connections.set(userId, (connections.get(userId) ?? 0) + 1);
    registerPresence(io, socket);
    void presenceConnected(io, socket).catch((error) => console.warn('[presence] could not mark online:', error.message));
    // The portal's super admin sees everyone's presence, across organizations.
    void superAdminUserId()
      .then((id) => id === userId && socket.join('presence:watchers'))
      .catch(() => undefined);

    socket.on('project:join', async (projectId) => {
      if (isUuid(projectId) && (await canWatchProject(projectId, socket.data.userId))) socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => isUuid(projectId) && socket.leave(`project:${projectId}`));

    socket.on('disconnect', () => {
      const left = (connections.get(userId) ?? 1) - 1;
      if (left > 0) connections.set(userId, left);
      else connections.delete(userId);
      void presenceDisconnected(socket).catch((error) => console.warn('[presence] could not mark offline:', error.message));
    });
  });

  return io;
}

/** Tells every connected browser to reconnect elsewhere and stops accepting sockets (graceful shutdown). */
export const closeRealtime = () => new Promise((resolve) => (io ? io.close(() => resolve()) : resolve()));

/**
 * Someone lost access (removed from a project, or disabled or removed in an organization): every open tab of theirs
 * stops receiving that project's and organization's live events right away, on any server.
 */
export function revokeRealtimeAccess(userId, { organizationId = null, projectIds = [] } = {}) {
  if (!io) return;
  const rooms = [...projectIds.map((projectId) => `project:${projectId}`), ...(organizationId ? [`org:${organizationId}`] : [])];
  if (rooms.length) io.in(`user:${userId}`).socketsLeave(rooms);
}

/** Closes every open connection of an account that no longer exists (on any server). */
export function disconnectUser(userId) {
  io?.in(`user:${userId}`).disconnectSockets(true);
}

/** Every project event says which project it is about, so a page showing one project ignores the others. */
export const emitToProject = (projectId, event, payload) => io?.to(`project:${projectId}`).emit(event, { projectId, ...payload });
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToAll = (event, payload) => io?.emit(event, payload);
