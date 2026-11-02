import { isProduction } from '../config/index.js';
import { currentRequestId } from './context/request-context.js';

/**
 * One way to log: JSON lines in production (for log collectors, with the request id so one request's lines can be
 * found together), readable lines in development. Errors are logged with their stack, never sent to clients.
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug')] ?? LEVELS.info;

function serialize(value) {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack, code: value.code ?? value.parent?.code };
  return value;
}

function write(level, message, fields = {}) {
  if (LEVELS[level] < threshold) return;
  const requestId = currentRequestId();
  const details = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, serialize(value)]));
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  if (isProduction) {
    out.write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...(requestId ? { requestId } : {}), ...details })}\n`);
    return;
  }
  const tag = requestId ? ` [${requestId.slice(0, 8)}]` : '';
  const extra = Object.keys(details).length ? ` ${JSON.stringify(details, null, 0)}` : '';
  out.write(`${level.toUpperCase()}${tag} ${message}${extra}\n`);
  if (fields.error instanceof Error && fields.error.stack) out.write(`${fields.error.stack}\n`);
}

export const logger = {
  debug: (message, fields) => write('debug', message, fields),
  info: (message, fields) => write('info', message, fields),
  warn: (message, fields) => write('warn', message, fields),
  error: (message, fields) => write('error', message, fields),
};
