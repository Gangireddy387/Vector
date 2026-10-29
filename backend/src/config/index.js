import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const list = (value) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const DEFAULT_JWT_SECRET = 'vector-dev-secret-change-me';

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: toInt(process.env.PORT, 4000),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  jwt: {
    secret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  db: {
    /** Precedence: DATABASE_URL → DB_NAME/DB_* (PostgreSQL) → local SQLite file. */
    url: process.env.DATABASE_URL || null,
    dialect: process.env.DB_DIALECT || (process.env.DB_NAME ? 'postgres' : 'sqlite'),
    name: process.env.DB_NAME || 'vector',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 5432),
    storage: path.resolve(process.env.DB_STORAGE ?? 'data/vector.sqlite'),
    logging: process.env.DB_LOGGING === 'true',
    autoSync: process.env.DB_AUTO_SYNC !== 'false',
  },
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'no-reply@vector.local',
    fromName: process.env.SENDGRID_FROM_NAME || 'Vector',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  },
  uploads: {
    dir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
    maxFileSizeMb: toInt(process.env.UPLOAD_MAX_MB, 20),
  },
  jobs: {
    enabled: process.env.JOBS_ENABLED !== 'false',
  },
  /** How meeting video finds a path between browsers: STUN always, plus a TURN relay for networks that block direct calls. */
  meetings: {
    stunUrls: list(process.env.STUN_URLS ?? 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
    turnUrls: list(process.env.TURN_URLS),
    /** coturn `static-auth-secret`: each person gets a password that expires after `turnTtlSeconds`. */
    turnSecret: process.env.TURN_SECRET || '',
    /** Fixed TURN login, for providers without expiring passwords. */
    turnUsername: process.env.TURN_USERNAME || '',
    turnPassword: process.env.TURN_PASSWORD || '',
    turnTtlSeconds: toInt(process.env.TURN_TTL_SECONDS, 6 * 60 * 60),
    cloudflareTurnKeyId: process.env.CLOUDFLARE_TURN_KEY_ID || '',
    cloudflareTurnApiToken: process.env.CLOUDFLARE_TURN_API_TOKEN || '',
  },
  /** Web Push (calls ringing on phones and computers). Without keys, a pair is generated once and kept in `keysFile`. */
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || '',
    keysFile: path.resolve(process.env.VAPID_KEYS_FILE ?? 'data/vapid-keys.json'),
  },
  /** Portal owner who approves new organizations. Without an email, new organizations are approved automatically. */
  superAdmin: {
    email: (process.env.SUPER_ADMIN_EMAIL ?? '').trim().toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD ?? '',
    name: process.env.SUPER_ADMIN_NAME?.trim() || 'Super Admin',
  },
};

export const isProduction = config.env === 'production';

if (isProduction && config.jwt.secret === DEFAULT_JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
