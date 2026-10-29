import { Server } from 'socket.io';
import { config } from '../../config/index.js';
import { User } from '../../database/models.js';
import { verifyAccessToken } from '../../modules/auth/token.js';
import { relayConfigured } from '../../modules/meetings/ice-servers.js';
import { registerMeetingCollab } from '../../modules/meetings/meeting.collab.js';
import { registerMeetingSignaling } from '../../modules/meetings/meeting.signaling.js';
import { canWatchProject } from '../../modules/projects/project-access.js';

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

/** Records the moment and tells the super admin, whose views show who is online right now. */
async function presenceChanged(userId, online) {
  const lastSeenAt = new Date();
  await User.update({ lastSeenAt }, { where: { id: userId }, silent: true }).catch(() => undefined);
  const watcher = await superAdminUserId().catch(() => null);
  if (watcher && watcher !== userId) io?.to(`user:${watcher}`).emit('presence:changed', { userId, online, lastSeenAt });
}

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrl.split(','), credentials: true },
  });
  if (!relayConfigured()) {
    console.warn('[meetings] no TURN relay configured: video calls fail on networks that block direct connections (see TURN_* in .env.example)');
  }

  io.use((socket, next) => {
    try {
      const payload = verifyAccessToken(socket.handshake.auth?.token);
      // Guests (meeting guest link) only take part in the one call their pass is for.
      if (payload.typ === 'guest') socket.data.guest = { id: `guest:${payload.gid}`, name: payload.name, meetingId: payload.mid };
      else socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    registerMeetingSignaling(io, socket);
    registerMeetingCollab(io, socket);
    if (socket.data.guest) return;

    const { userId } = socket.data;
    socket.join(`user:${userId}`);
    const open = (connections.get(userId) ?? 0) + 1;
    connections.set(userId, open);
    if (open === 1) void presenceChanged(userId, true);

    socket.on('project:join', async (projectId) => {
      if (await canWatchProject(projectId, socket.data.userId)) socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => socket.leave(`project:${projectId}`));

    socket.on('disconnect', () => {
      const left = (connections.get(userId) ?? 1) - 1;
      if (left > 0) return connections.set(userId, left);
      connections.delete(userId);
      void presenceChanged(userId, false);
    });
  });

  return io;
}

export const emitToProject = (projectId, event, payload) => io?.to(`project:${projectId}`).emit(event, payload);
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToAll = (event, payload) => io?.emit(event, payload);
