import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Starts the real backend on its own port with a throwaway SQLite database, no email, no AI, no Redis and no
 * background jobs, so integration tests never touch real data or send real messages.
 */
const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `env`: extra settings for this test's server (e.g. a super admin to turn on plan features). */
export async function startIsolatedServer({ port = 4100 + Math.floor(Math.random() * 500), env: extra = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vector-test-'));
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DB_DIALECT: 'sqlite',
    DB_STORAGE: path.join(dir, 'test.sqlite'),
    DATABASE_URL: '',
    DB_LOGGING: 'false',
    UPLOAD_DIR: path.join(dir, 'uploads'),
    VAPID_KEYS_FILE: path.join(dir, 'vapid.json'),
    JWT_SECRET: 'integration-test-secret-0123456789-abcdefghijklmnop',
    SUPER_ADMIN_EMAIL: '',
    SUPER_ADMIN_PASSWORD: '',
    SENDGRID_API_KEY: '',
    OPENAI_API_KEY: '',
    REDIS_URL: '',
    LIVEKIT_URL: '',
    JOBS_ENABLED: 'false',
    API_RATE_LIMIT_PER_MINUTE: '100000',
    CLIENT_URL: 'http://localhost:5173',
    GOOGLE_CLIENT_ID: '',
    MICROSOFT_CLIENT_ID: '',
    DIALIN_NUMBER: '',
    ...extra,
  };
  const child = spawn(process.execPath, ['src/server.js'], { cwd: backendDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`test server exited early:\n${output}`);
    try {
      if ((await fetch(`${base}/api/health`)).ok) break;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return {
    base,
    api: `${base}/api`,
    output: () => output,
    alive: () => child.exitCode === null,
    async stop() {
      child.kill();
      await new Promise((resolve) => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A tiny API client: `call('POST', '/projects', body, token)` → { status, body }. */
export function apiClient(api) {
  return async function call(method, url, body, token, organizationId) {
    const response = await fetch(`${api}${url}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(organizationId ? { 'X-Organization-Id': organizationId } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    const parse = () => {
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return text;
      }
    };
    return { status: response.status, body: parse() };
  };
}
