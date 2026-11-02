import type { Socket } from 'socket.io-client'
import { getCurrentScope, onScopeDispose } from 'vue'
import { onSocketChange } from './realtime'

/** Handlers keyed by event name; each receives the event's payload (typed by the caller). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io's own listener type
export type SocketHandlers = Record<string, (...args: any[]) => void>

/**
 * Listens to live events on the app's connection, and keeps listening when that connection is replaced (signing in
 * again, coming back from a guest call…). `onConnect` runs on every (re)connection, e.g. to rejoin rooms or reload.
 * Returns a function that stops listening.
 */
export function bindSocketEvents(handlers: SocketHandlers, options: { onConnect?: (socket: Socket) => void; includeGuest?: boolean } = {}) {
  let bound: Socket | null = null
  const connect = () => bound && options.onConnect?.(bound)
  const detach = () => {
    if (!bound) return
    for (const [event, handler] of Object.entries(handlers)) bound.off(event, handler)
    bound.off('connect', connect)
    bound = null
  }
  const stopFollowing = onSocketChange((socket, guest) => {
    detach()
    if (!socket || (guest && !options.includeGuest)) return
    bound = socket
    for (const [event, handler] of Object.entries(handlers)) socket.on(event, handler)
    socket.on('connect', connect)
    if (socket.connected) connect()
  })
  return () => {
    stopFollowing()
    detach()
  }
}

/** `bindSocketEvents` for a component or composable: stops listening when it unmounts. */
export function useSocketEvents(handlers: SocketHandlers, options: { onConnect?: (socket: Socket) => void; includeGuest?: boolean } = {}) {
  const stop = bindSocketEvents(handlers, options)
  if (getCurrentScope()) onScopeDispose(stop)
  return stop
}
