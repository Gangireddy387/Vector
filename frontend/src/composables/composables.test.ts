import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'

/** A stand-in for socket.io: records what the app emits and lets tests replay server events. */
class FakeSocket {
  connected = true
  emitted: Array<[string, unknown]> = []
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  on(event: string, handler: (...args: unknown[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(handler)
    return this
  }
  off(event: string, handler: (...args: unknown[]) => void) {
    this.listeners.get(event)?.delete(handler)
    return this
  }
  emit(event: string, payload?: unknown) {
    this.emitted.push([event, payload])
    return this
  }
  receive(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((handler) => handler(payload))
  }
  disconnect() {
    this.connected = false
  }
  listenerCount(event: string) {
    return this.listeners.get(event)?.size ?? 0
  }
}

const sockets: FakeSocket[] = []
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = new FakeSocket()
    sockets.push(socket)
    return socket
  },
}))
vi.mock('@/lib/http', () => ({ getStoredToken: () => 'token' }))

afterEach(() => {
  sockets.length = 0
})

describe('useConfirm', () => {
  it('asks queued questions one after another instead of losing them', async () => {
    vi.useFakeTimers()
    const { useConfirm, settleConfirm, confirmState } = await import('./useConfirm')
    const confirm = useConfirm()
    const first = confirm({ title: 'First?' })
    const second = confirm({ title: 'Second?' })
    expect(confirmState.title).toBe('First?')
    settleConfirm(true)
    await expect(first).resolves.toBe(true)
    vi.advanceTimersByTime(200)
    expect(confirmState.title).toBe('Second?')
    settleConfirm(false)
    await expect(second).resolves.toBe(false)
    vi.useRealTimers()
  })
})

describe('socket events', () => {
  it('keep working when the app replaces its connection', async () => {
    const { connectRealtime, disconnectRealtime } = await import('@/lib/realtime')
    const { bindSocketEvents } = await import('@/lib/socket-events')
    connectRealtime()
    const received: unknown[] = []
    const stop = bindSocketEvents({ 'notification:created': (payload: unknown) => received.push(payload) })
    sockets[0]!.receive('notification:created', 1)

    sockets[0]!.connected = false
    connectRealtime()
    expect(sockets[0]!.listenerCount('notification:created')).toBe(0)
    sockets[1]!.receive('notification:created', 2)
    expect(received).toEqual([1, 2])

    stop()
    sockets[1]!.receive('notification:created', 3)
    expect(received).toEqual([1, 2])
    disconnectRealtime()
  })
})

describe('project rooms', () => {
  it('stay joined while any view still follows the project', async () => {
    const { connectRealtime, disconnectRealtime } = await import('@/lib/realtime')
    const { enterRoom, leaveRoom } = await import('./useProjectRealtime')
    connectRealtime()
    const socket = sockets[0]!
    enterRoom('p1') // the board
    enterRoom('p1') // the task panel over it
    leaveRoom('p1') // the panel closes
    expect(socket.emitted.filter(([event]) => event === 'project:leave')).toHaveLength(0)
    leaveRoom('p1') // the board closes
    expect(socket.emitted.filter(([event]) => event === 'project:join')).toHaveLength(1)
    expect(socket.emitted.filter(([event]) => event === 'project:leave')).toHaveLength(1)
    disconnectRealtime()
  })

  it('ignores events about other projects', async () => {
    const { connectRealtime, disconnectRealtime } = await import('@/lib/realtime')
    const { useProjectRealtime } = await import('./useProjectRealtime')
    const { createPinia, setActivePinia } = await import('pinia')
    setActivePinia(createPinia())
    vi.useFakeTimers()
    connectRealtime()
    const onChange = vi.fn()
    const scope = effectScope()
    scope.run(() => useProjectRealtime(ref('p1'), onChange))
    sockets[0]!.receive('issue:changed', { projectId: 'p2' })
    vi.advanceTimersByTime(400)
    expect(onChange).not.toHaveBeenCalled()
    sockets[0]!.receive('issue:changed', { projectId: 'p1' })
    vi.advanceTimersByTime(400)
    expect(onChange).toHaveBeenCalledTimes(1)
    scope.stop()
    vi.useRealTimers()
    disconnectRealtime()
  })
})
