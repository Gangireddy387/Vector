import crypto from 'node:crypto';
import { createClient } from 'redis';
import { config } from '../../config/index.js';

/**
 * State that every backend server must see the same way (who is in which call, whiteboards…). With REDIS_URL it
 * lives in Redis, so several servers can share the load and calls survive a restart; without it, in this process.
 * Values are JSON. Both stores behave alike, so the rest of the code does not care which one runs.
 */

const LOCK_TTL_MS = 5000;
const LOCK_WAIT_MS = 8000;
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/** Per key, one task at a time in this process (and the cross-server lock is only taken by one of them). */
function createQueue() {
  const queues = new Map();
  return (key, task) => {
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous.then(task, task);
    const settled = next.catch(() => undefined);
    queues.set(key, settled);
    void settled.finally(() => queues.get(key) === settled && queues.delete(key));
    return next;
  };
}

function memoryStore() {
  const values = new Map();
  const hashes = new Map();
  const timers = new Map();
  const expire = (key, ttlSeconds) => {
    clearTimeout(timers.get(key));
    if (!ttlSeconds) return timers.delete(key);
    const timer = setTimeout(() => {
      values.delete(key);
      hashes.delete(key);
      timers.delete(key);
    }, ttlSeconds * 1000);
    timer.unref?.();
    timers.set(key, timer);
  };
  const queue = createQueue();
  return {
    kind: 'memory',
    async get(key) {
      const raw = values.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async getMany(keys) {
      return keys.map((key) => (values.has(key) ? JSON.parse(values.get(key)) : null));
    },
    async set(key, value, ttlSeconds = 0) {
      values.set(key, JSON.stringify(value));
      expire(key, ttlSeconds);
    },
    async del(...keys) {
      for (const key of keys) {
        values.delete(key);
        hashes.delete(key);
        expire(key, 0);
      }
    },
    async hget(key, field) {
      const raw = hashes.get(key)?.get(field);
      return raw === undefined ? null : JSON.parse(raw);
    },
    async hset(key, field, value, ttlSeconds = 0) {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, JSON.stringify(value));
      expire(key, ttlSeconds);
    },
    async hdel(key, field) {
      hashes.get(key)?.delete(field);
    },
    async hvalues(key) {
      return [...(hashes.get(key)?.values() ?? [])].map((raw) => JSON.parse(raw));
    },
    async hcount(key) {
      return hashes.get(key)?.size ?? 0;
    },
    withLock: (key, task) => queue(key, task),
  };
}

function redisStore(client) {
  const prefixed = (key) => `${config.redis.prefix}${key}`;
  const queue = createQueue();
  async function acquire(lockKey) {
    const token = crypto.randomUUID();
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (Date.now() < deadline) {
      if (await client.set(lockKey, token, { NX: true, PX: LOCK_TTL_MS })) return token;
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 20));
    }
    throw new Error('The call is busy. Try again.');
  }
  return {
    kind: 'redis',
    async get(key) {
      const raw = await client.get(prefixed(key));
      return raw === null ? null : JSON.parse(raw);
    },
    async getMany(keys) {
      if (!keys.length) return [];
      const raws = await client.mGet(keys.map(prefixed));
      return raws.map((raw) => (raw === null ? null : JSON.parse(raw)));
    },
    async set(key, value, ttlSeconds = 0) {
      const raw = JSON.stringify(value);
      if (ttlSeconds) await client.set(prefixed(key), raw, { EX: ttlSeconds });
      else await client.set(prefixed(key), raw);
    },
    async del(...keys) {
      if (keys.length) await client.del(keys.map(prefixed));
    },
    async hget(key, field) {
      const raw = await client.hGet(prefixed(key), field);
      return raw == null ? null : JSON.parse(raw);
    },
    async hset(key, field, value, ttlSeconds = 0) {
      await client.hSet(prefixed(key), field, JSON.stringify(value));
      if (ttlSeconds) await client.expire(prefixed(key), ttlSeconds);
    },
    async hdel(key, field) {
      await client.hDel(prefixed(key), field);
    },
    async hvalues(key) {
      return (await client.hVals(prefixed(key))).map((raw) => JSON.parse(raw));
    },
    async hcount(key) {
      return client.hLen(prefixed(key));
    },
    withLock: (key, task) =>
      queue(key, async () => {
        const lockKey = prefixed(`lock:${key}`);
        const token = await acquire(lockKey);
        try {
          return await task();
        } finally {
          await client.eval(RELEASE, { keys: [lockKey], arguments: [token] }).catch(() => undefined);
        }
      }),
  };
}

let store = memoryStore();
let clients = null;

/** Connects to Redis when configured. Returns the clients the realtime server shares messages through, or null. */
export async function initSharedState() {
  if (!config.redis.url || clients) return clients;
  const client = createClient({ url: config.redis.url });
  client.on('error', (error) => console.error('[redis]', error.message));
  await client.connect();
  const subscriber = client.duplicate();
  subscriber.on('error', (error) => console.error('[redis]', error.message));
  await subscriber.connect();
  store = redisStore(client);
  clients = { client, subscriber };
  console.info('[redis] shared state and realtime messages go through Redis');
  return clients;
}

export async function closeSharedState() {
  if (!clients) return;
  await Promise.allSettled([clients.client.quit(), clients.subscriber.quit()]);
  clients = null;
}

/** The active store; read it at call time (it changes once, when Redis connects at startup). */
export const shared = new Proxy(
  {},
  {
    get: (_target, property) => store[property],
  },
);
