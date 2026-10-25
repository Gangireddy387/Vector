import { prepareDatabase } from './connection.js';
import { sequelize } from './models.js';
import { applyDataUpgrades, applySchemaUpgrades } from './upgrades.js';

const force = process.argv.includes('--force');
const alter = process.argv.includes('--alter');

try {
  await prepareDatabase();
  if (!force) await applySchemaUpgrades();
  await sequelize.sync({ force, alter });
  await applyDataUpgrades();
  console.log(`[db] schema synchronised${force ? ' (all tables recreated)' : alter ? ' (altered)' : ''}`);
  process.exit(0);
} catch (error) {
  console.error('[db] sync failed', error);
  process.exit(1);
}
