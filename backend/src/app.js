import crypto from 'node:crypto';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isProduction } from './config/index.js';
import { sequelize } from './database/models.js';
import { createApiRouter } from './routes.js';
import { runWithContext } from './shared/context/request-context.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';

/** Secrets in addresses (guest passes, recording links, reset tokens) are never written to the logs. */
const redactUrl = (url) => url.replace(/([?&](?:token|t)=)[^&]+/gi, '$1[redacted]').replace(/(\/meeting-links\/)[^/?]+/, '$1[redacted]');

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // The API only answers JSON and files; nothing it serves should run scripts or be framed.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"], mediaSrc: ["'self'"] } },
      strictTransportSecurity: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  // Sign-in uses a bearer token, not cookies, so browsers never send credentials on their own.
  app.use(cors({ origin: config.clientUrl.split(','), credentials: false, exposedHeaders: ['Content-Disposition', 'X-Request-Id'] }));
  app.use(compression());

  // Every request gets an id (or keeps the proxy's), returned to the client and attached to every log line.
  app.use((req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    runWithContext({ requestId: req.id }, next);
  });
  morgan.token('id', (req) => req.id);
  morgan.token('safe-url', (req) => redactUrl(req.originalUrl ?? req.url));
  app.use(
    morgan(
      isProduction
        ? ':remote-addr :id ":method :safe-url HTTP/:http-version" :status :res[content-length] :response-time ms ":user-agent"'
        : ':method :safe-url :status :response-time ms',
    ),
  );

  app.use(express.json({ limit: '2mb' }));

  /** For load balancers and monitoring: is the API up, and can it reach its database? No configuration details. */
  app.get('/api/health', async (_req, res) => {
    try {
      await sequelize.query('SELECT 1');
      res.json({ status: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'unavailable', time: new Date().toISOString() });
    }
  });

  // A ceiling per address for the whole API; sign-in and other sensitive routes have stricter limits of their own.
  app.use('/api', rateLimit({ windowMs: 60_000, limit: config.rateLimit.perMinute, standardHeaders: true, legacyHeaders: false }));
  app.use('/api', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
