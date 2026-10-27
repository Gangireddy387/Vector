/**
 * Prepares an empty or existing database without touching its data: creates missing tables and columns,
 * the default plans and the portal's super admin (SUPER_ADMIN_* in .env). Safe to run any time.
 * Organizations, people and projects are created through the app itself.
 */
import { config } from '../config/index.js';
import { prepareDatabase } from './connection.js';
import { sequelize } from './models.js';
import { applyDataUpgrades, applySchemaUpgrades } from './upgrades.js';
import { ensureDefaultPlans } from '../modules/plans/plan.service.js';
import { ensureSuperAdmin } from '../modules/super-admin/super-admin.service.js';

async function seed() {
  await prepareDatabase();
  await applySchemaUpgrades();
  await sequelize.sync();
  await applyDataUpgrades();
  await ensureDefaultPlans();
  await ensureSuperAdmin();

  if (config.superAdmin.email) console.log(`[seed] super admin ready: ${config.superAdmin.email}`);
  else console.warn('[seed] SUPER_ADMIN_EMAIL is not set in backend/.env, so no super admin was created');
  console.log('[seed] default plans ready. Sign up in the app to create your organization.');
}

seed()
  .then(async () => {
    await sequelize.close();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('[seed] failed', error);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
