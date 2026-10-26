import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { prepareDatabase } from './database/connection.js';
import { sequelize } from './database/models.js';
import { applyDataUpgrades, applySchemaUpgrades } from './database/upgrades.js';
import { registerListeners } from './events/register-listeners.js';
import { ensureDefaultPlans } from './modules/plans/plan.service.js';
import { ensureSuperAdmin } from './modules/super-admin/super-admin.service.js';
import { startScheduler } from './jobs/scheduler.js';
import { initRealtime } from './shared/realtime/socket.js';

async function bootstrap() {
  await prepareDatabase();
  await applySchemaUpgrades();
  if (config.db.autoSync) await sequelize.sync();
  await applyDataUpgrades();
  await ensureDefaultPlans();
  await ensureSuperAdmin();

  registerListeners();

  const server = http.createServer(createApp());
  initRealtime(server);
  startScheduler();

  server.listen(config.port, () => {
    console.info(`[server] Vector API listening on http://localhost:${config.port}/api`);
  });

  const shutdown = async (signal) => {
    console.info(`[server] ${signal} received, shutting down`);
    server.close();
    await sequelize.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
