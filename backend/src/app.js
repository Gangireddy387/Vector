import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { config, isProduction } from './config/index.js';
import { createApiRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './shared/middleware/error-handler.js';
import { isEmailEnabled } from './shared/services/email.service.js';
import { isAiEnabled } from './modules/ai/openai.client.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.clientUrl.split(','), credentials: true, exposedHeaders: ['Content-Disposition'] }));
  app.use(compression());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan(isProduction ? 'combined' : 'dev'));

  app.get('/api/health', (_req, res) =>
    res.json({ status: 'ok', time: new Date().toISOString(), integrations: { email: isEmailEnabled(), ai: isAiEnabled() } }),
  );
  app.use('/api', createApiRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
