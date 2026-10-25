import { z } from 'zod';
import { isValidTimeZone } from '../../shared/utils/timezone.js';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(2, 'Name must be at least 2 characters').max(120);
export const organizationName = z.string().trim().min(2, 'Organization name must be at least 2 characters').max(80);
export const organizationSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'The address needs at least 3 characters')
  .max(40, 'Keep the address under 40 characters')
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Use lowercase letters, numbers and hyphens');

export const registerSchema = z.object({ name, email, password, organizationName, organizationSlug });
export const loginSchema = z.object({ email, password: z.string().min(1, 'Password is required') });
export const forgotPasswordSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(10), password });
export const acceptInviteSchema = z.object({ token: z.string().min(10), name, password });

export const updateProfileSchema = z.object({
  name: name.optional(),
  title: z.string().trim().max(120).nullable().optional(),
  timezone: z.string().trim().max(64).refine(isValidTimeZone, 'Choose a valid time zone').optional(),
  avatarColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  preferences: z
    .object({
      emailNotifications: z.boolean().optional(),
      dailyDigest: z.boolean().optional(),
      /** Follow the device's time zone automatically (default) instead of a fixed one. */
      autoTimezone: z.boolean().optional(),
    })
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
