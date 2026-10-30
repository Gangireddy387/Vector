import { io, type Socket } from 'socket.io-client'
import { getStoredToken } from './http'

let socket: Socket | null = null
let isGuestSocket = false
const socketListeners = new Set<(socket: Socket | null, guest: boolean) => void>()

function replace(next: Socket | null, guest: boolean) {
  socket = next
  isGuestSocket = guest
  socketListeners.forEach((listener) => listener(next, guest))
}

export function connectRealtime() {
  const token = getStoredToken()
  if (!token) return null
  if (socket?.connected) return socket

  socket?.disconnect()
  replace(
    io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10000,
    }),
    false,
  )
  return socket
}

/** A guest's connection (meeting guest link): it stands in for the app's connection in this tab, for one call only. */
export function connectGuestRealtime(token: string) {
  socket?.disconnect()
  replace(
    io(import.meta.env.VITE_SOCKET_URL || undefined, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 10000,
    }),
    true,
  )
  return socket!
}

export const getSocket = () => socket

/** Runs now and whenever the app's connection is replaced (signing in again, a guest link…). */
export function onSocketChange(listener: (socket: Socket | null, guest: boolean) => void) {
  socketListeners.add(listener)
  listener(socket, isGuestSocket)
  return () => socketListeners.delete(listener)
}

export function disconnectRealtime() {
  socket?.disconnect()
  replace(null, false)
}
