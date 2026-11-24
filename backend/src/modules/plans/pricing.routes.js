import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { isSuperAdmin } from '../super-admin/super-admin.service.js';
import { getPricingSettings, getPublicPricing, updatePricingSettings } from './pricing.service.js';

/** Public read for the marketing pricing page. */
export const publicPricingRoutes = Router();
publicPricingRoutes.get('/pricing', async (_req, res) => res.json(await getPublicPricing()));

function requireSuperAdmin(req, _res, next) {
  if (!isSuperAdmin(req.user)) throw ApiError.forbidden('Only the super admin can do this');
  next();
}

const pricingSchema = z
  .object({
    currency: z.enum(['INR', 'USD']).optional(),
    proAmountInr: z.number().int().min(0).max(1_000_000).optional(),
    proAmountUsd: z.number().int().min(0).max(1_000_000).optional(),
    enterpriseAmountInr: z.number().int().min(0).max(1_000_000).optional(),
    enterpriseAmountUsd: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

/** Super admin chooses rupees or dollars for list prices. */
export const pricingAdminRoutes = Router();
pricingAdminRoutes.use('/super-admin/pricing', requireSuperAdmin);
pricingAdminRoutes.get('/super-admin/pricing', async (_req, res) => res.json(await getPricingSettings()));
pricingAdminRoutes.put('/super-admin/pricing', validate({ body: pricingSchema }), async (req, res) =>
  res.json(await updatePricingSettings(req.body, req.user?.id)),
);
