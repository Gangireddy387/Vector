import { z } from 'zod';

const email = z.string().trim().email().max(190);
const password = z.string().min(1).max(200);

/** Preset lengths shown in the UI; admins may also save a custom value like `2h` or `14d`. */
export const EMBED_SESSION_PRESETS = ['1h', '12h', '1d', '7d', '30d'];

/** Accepts presets or custom jwt-style durations: 15m–90d (e.g. 45m, 6h, 14d). */
export const embedSessionExpiresInSchema = z
  .string()
  .trim()
  .regex(/^\d+[mhd]$/, 'Use a value like 45m, 6h, or 14d')
  .refine((value) => {
    const match = /^(\d+)([mhd])$/.exec(value);
    if (!match) return false;
    const amount = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount < 1) return false;
    if (unit === 'm') return amount >= 15 && amount <= 24 * 60;
    if (unit === 'h') return amount >= 1 && amount <= 24 * 30;
    return amount >= 1 && amount <= 90;
  }, 'Pick at least 15 minutes and at most 90 days');

export const createEmbedAppSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

export const embedSettingsSchema = z.object({
  sessionExpiresIn: embedSessionExpiresInSchema,
});

/**
 * Partner connect: org admin email + password + both embed keys.
 * Admin then sets up people/teams inside Vector as usual.
 */
export const embedConnectSchema = z.object({
  email,
  password,
  publishableKey: z.string().trim().min(10).max(64),
  secretKey: z.string().trim().min(24).max(80),
  /** Path inside Vector after connect (default home). */
  path: z.string().trim().max(500).optional().nullable(),
});
