import { Server } from 'socket.io';
import { config } from '../../config/index.js';
import { verifyAccessToken } from '../../modules/auth/token.js';
import { canWatchProject } from '../../modules/projects/project-access.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.clientUrl.split(','), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const payload = verifyAccessToken(socket.handshake.auth?.token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);

    socket.on('project:join', async (projectId) => {
      if (await canWatchProject(projectId, socket.data.userId)) socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => socket.leave(`project:${projectId}`));
  });

  return io;
}

export const emitToProject = (projectId, event, payload) => io?.to(`project:${projectId}`).emit(event, payload);
export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
export const emitToAll = (event, payload) => io?.emit(event, payload);
