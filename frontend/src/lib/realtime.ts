import { io, type Socket } from 'socket.io-client'
import { getStoredToken } from './http'

let socket: Socket | null = null

export function connectRealtime() {
  const token = getStoredToken()
  if (!token) return null
  if (socket?.connected) return socket

  socket?.disconnect()
  socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 10000,
  })
  return socket
}

export const getSocket = () => socket

export function disconnectRealtime() {
  socket?.disconnect()
  socket = null
}
