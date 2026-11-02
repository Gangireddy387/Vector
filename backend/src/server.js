import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { prepareDatabase } from './database/connection.js';
import { sequelize } from './database/models.js';
import { applyDataUpgrades, applyIndexUpgrades, applySchemaUpgrades } from './database/upgrades.js';
import { registerListeners } from './events/register-listeners.js';
import { ensureDefaultPlans } from './modules/plans/plan.service.js';
import { ensureSuperAdmin } from './modules/super-admin/super-admin.service.js';
import { startScheduler, stopScheduler } from './jobs/scheduler.js';
import { logger } from './shared/logger.js';
import { closeSharedState, initSharedState } from './shared/realtime/shared-state.js';
import { closeRealtime, initRealtime } from './shared/realtime/socket.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

// A bug in one request or socket event must not take the server down for everyone: it is logged and the server
// keeps running. Truly unexpected states (uncaught exceptions) shut down cleanly so the service manager restarts it.
process.on('unhandledRejection', (reason) => logger.error('unhandled promise rejection', { error: reason }));

async function bootstrap() {
  await prepareDatabase();
  await applySchemaUpgrades();
  if (config.db.autoSync) await sequelize.sync();
  await applyIndexUpgrades();
  await applyDataUpgrades();
  await ensureDefaultPlans();
  await ensureSuperAdmin();

  registerListeners();
  const redis = await initSharedState();

  const server = http.createServer(createApp());
  initRealtime(server, redis);
  startScheduler();

  server.listen(config.port, () => logger.info(`Vector API listening on http://localhost:${config.port}/api`));

  let stopping = false;
  /** Stops taking work, lets requests in flight finish (up to a limit), then closes connections in order. */
  const shutdown = async (signal, code = 0) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal} received, shutting down`);
    const forced = setTimeout(() => {
      logger.warn('shutdown took too long; exiting');
      process.exit(code || 1);
    }, SHUTDOWN_TIMEOUT_MS);
    forced.unref();
    stopScheduler();
    await closeRealtime();
    await new Promise((resolve) => server.close(() => resolve()));
    await closeSharedState();
    await sequelize.close();
    process.exit(code);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { error });
    void shutdown('uncaughtException', 1);
  });
}

bootstrap().catch((error) => {
  logger.error('failed to start', { error });
  process.exit(1);
});
