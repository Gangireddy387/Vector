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
  /** How many reverse proxies (Nginx…) sit in front; their X-Forwarded-For gives the real client address. 0: none. */
  trustProxy: toInt(process.env.TRUST_PROXY, 1),
  rateLimit: {
    /** Requests per minute per address across the whole API. */
    perMinute: toInt(process.env.API_RATE_LIMIT_PER_MINUTE, 1200),
  },
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
    /** Speech to text for meeting notes (any browser, phone callers, Indian languages). */
    transcribeModel: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
    /** Meaning-based search across meetings. */
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
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
    /** Calls where every browser connects to every other one stay small; a LiveKit server lifts the cap. */
    directCallSize: toInt(process.env.MEETING_DIRECT_CALL_SIZE, 8),
    /** Minutes before the start when invited people get a reminder. */
    reminderMinutes: toInt(process.env.MEETING_REMINDER_MINUTES, 10),
    recordingMaxMb: toInt(process.env.MEETING_RECORDING_MAX_MB, 1024),
    /** Transcripts (and their search index) are deleted after this many days; 0 keeps them. */
    transcriptDays: toInt(process.env.MEETING_TRANSCRIPT_DAYS, 0),
  },
  /**
   * LiveKit media server (self-hosted or LiveKit Cloud). When set, calls send video through it instead of between
   * browsers, so they can be much larger and the host's mute, remove and sharing controls are enforced by the server.
   */
  livekit: {
    url: process.env.LIVEKIT_URL || '',
    apiKey: process.env.LIVEKIT_API_KEY || '',
    apiSecret: process.env.LIVEKIT_API_SECRET || '',
    callSize: toInt(process.env.LIVEKIT_CALL_SIZE, 100),
    /**
     * Phone dial-in through LiveKit SIP: the inbound trunk(s) your phone number is connected to, and the number to
     * show people. Callers dial it and enter the meeting's PIN.
     */
    sipTrunkIds: list(process.env.LIVEKIT_SIP_TRUNK_IDS),
    dialInNumber: process.env.DIALIN_NUMBER || '',
  },
  /**
   * Two-way calendar sync: OAuth apps registered with Google (Calendar API) and/or Microsoft (Graph, Calendars.ReadWrite).
   * Redirect URI to register: <PUBLIC_API_URL>/api/calendar/oauth/<google|microsoft>/callback
   */
  calendar: {
    publicApiUrl: (process.env.PUBLIC_API_URL || (process.env.CLIENT_URL ?? 'http://localhost:5173').split(',')[0]).replace(/\/$/, ''),
    google: { clientId: process.env.GOOGLE_CLIENT_ID || '', clientSecret: process.env.GOOGLE_CLIENT_SECRET || '' },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      tenant: process.env.MICROSOFT_TENANT || 'common',
    },
    /** Encrypts stored calendar sign-ins; defaults to a key derived from JWT_SECRET. */
    tokenKey: process.env.CALENDAR_TOKEN_KEY || '',
  },
  /** Shared state for running several backend servers (and keeping calls through a restart). Without it, one server. */
  redis: {
    url: process.env.REDIS_URL || '',
    prefix: process.env.REDIS_PREFIX || 'vector:',
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

/** Values from the code or the example env file, which anyone with the repository knows. */
const KNOWN_SECRETS = new Set([DEFAULT_JWT_SECRET, 'replace-with-a-long-random-string', 'change-me', 'secret', 'changeme']);
export const MIN_JWT_SECRET_LENGTH = 32;

/** Whether a signing secret is safe: not a published placeholder, long, and not one repeated character. */
export function isStrongSecret(secret) {
  return Boolean(secret) && !KNOWN_SECRETS.has(secret) && secret.length >= MIN_JWT_SECRET_LENGTH && new Set(secret).size >= 10;
}

if (!isStrongSecret(config.jwt.secret)) {
  const advice = `JWT_SECRET must be a random value of at least ${MIN_JWT_SECRET_LENGTH} characters (for example: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")`;
  // Anyone who knows the secret can sign in as anyone, so production refuses to start with a weak one.
  if (isProduction) throw new Error(advice);
  console.warn(`[security] ${advice}. Using a weak secret is only acceptable on a development machine.`);
}
