import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { Op, Sequelize } from 'sequelize';
import { config } from '../config/index.js';

const logging = config.db.logging ? (sql) => console.log(`[sql] ${sql}`) : false;
const define = { underscored: true };

function createConnection() {
  if (config.db.url) {
    return new Sequelize(config.db.url, { logging, define });
  }
  if (config.db.dialect === 'sqlite') {
    fs.mkdirSync(path.dirname(config.db.storage), { recursive: true });
    return new Sequelize({
      dialect: 'sqlite',
      storage: config.db.storage,
      logging,
      define,
      retry: { match: [/SQLITE_BUSY/], max: 5 },
    });
  }
  const { name, user, password, host, port, dialect } = config.db;
  return new Sequelize(name, user, password, {
    host,
    port,
    dialect,
    logging,
    define,
    pool: { max: 10, min: 0, idle: 10000 },
  });
}

export const sequelize = createConnection();
export const isSqlite = sequelize.getDialect() === 'sqlite';
export const isPostgres = sequelize.getDialect() === 'postgres';

/** Case-insensitive LIKE on every dialect (SQLite's LIKE already ignores case). */
export const likeOperator = isPostgres ? Op.iLike : Op.like;

/** Creates the PostgreSQL database from DB_NAME when it does not exist yet (development convenience). */
async function ensurePostgresDatabase() {
  if (!isPostgres || config.db.url) return;
  const { name, user, password, host, port } = config.db;
  const client = new pg.Client({ host, port, user, password, database: 'postgres' });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${name.replace(/"/g, '""')}"`);
      console.info(`[db] created PostgreSQL database "${name}"`);
    }
  } finally {
    await client.end();
  }
}

export async function prepareDatabase() {
  await ensurePostgresDatabase();
  await sequelize.authenticate();
  // WAL lets readers proceed while a write is in progress (SQLite only, persisted in the file).
  if (isSqlite) await sequelize.query('PRAGMA journal_mode = WAL;');
}
