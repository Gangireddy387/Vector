import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { isSuperAdmin } from '../super-admin/super-admin.service.js';
import { getLegalContact, updateLegalContact } from './legal.service.js';

/** Public read for Privacy Policy / Terms contact block. */
export const publicLegalRoutes = Router();
publicLegalRoutes.get('/legal', async (_req, res) => res.json(await getLegalContact()));

function requireSuperAdmin(req, _res, next) {
  if (!isSuperAdmin(req.user)) throw ApiError.forbidden('Only the super admin can do this');
  next();
}

const legalSchema = z
  .object({
    companyName: z.string().trim().min(1).max(120).optional(),
    contactEmail: z.string().trim().email('Enter a valid email').max(120).optional(),
    contactPhone: z.string().trim().max(40).optional(),
    postalAddress: z.string().trim().max(300).optional(),
    jurisdiction: z.string().trim().min(1).max(200).optional(),
    effectiveDate: z.string().trim().min(1).max(60).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field');

/** Super admin edits contact details shown on Privacy / Terms. */
export const legalAdminRoutes = Router();
legalAdminRoutes.use('/super-admin/legal', requireSuperAdmin);
legalAdminRoutes.get('/super-admin/legal', async (_req, res) => res.json(await getLegalContact()));
legalAdminRoutes.put('/super-admin/legal', validate({ body: legalSchema }), async (req, res) =>
  res.json(await updateLegalContact(req.body, req.user?.id)),
);
