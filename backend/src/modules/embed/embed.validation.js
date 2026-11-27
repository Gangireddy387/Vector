import { z } from 'zod';

const email = z.string().trim().email().max(190);
const password = z.string().min(1).max(200);

export const createEmbedAppSchema = z.object({
  name: z.string().trim().min(2).max(80),
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
