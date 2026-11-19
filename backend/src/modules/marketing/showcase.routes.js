import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { isSuperAdmin } from '../super-admin/super-admin.service.js';
import {
  addShowcasePortrait,
  listShowcase,
  removeShowcasePortrait,
  resolveShowcaseFile,
  showcaseUpload,
  updateShowcasePortrait,
} from './showcase.service.js';

/** Public read + file serve for marketing / auth showcase portraits. */
export const publicShowcaseRoutes = Router();
publicShowcaseRoutes.get('/showcase', async (_req, res) => res.json(await listShowcase()));
publicShowcaseRoutes.get('/showcase/:fileName', (req, res) => {
  const filePath = resolveShowcaseFile(req.params.fileName);
  res.sendFile(filePath);
});

function requireSuperAdmin(req, _res, next) {
  if (!isSuperAdmin(req.user)) throw ApiError.forbidden('Only the super admin can do this');
  next();
}

/** Super admin manages the gallery used on About / sign-in rich UI. */
export const showcaseAdminRoutes = Router();
showcaseAdminRoutes.use('/super-admin/showcase', requireSuperAdmin);
showcaseAdminRoutes.get('/super-admin/showcase', async (_req, res) => res.json(await listShowcase()));
showcaseAdminRoutes.post('/super-admin/showcase', showcaseUpload, async (req, res) =>
  res.status(201).json(await addShowcasePortrait(req.file, { name: req.body?.name })),
);
showcaseAdminRoutes.patch(
  '/super-admin/showcase/:id',
  validate({ body: z.object({ name: z.string().trim().min(1).max(60).optional(), sortOrder: z.number().int().min(0).max(999).optional() }) }),
  async (req, res) => res.json(await updateShowcasePortrait(req.params.id, req.body)),
);
showcaseAdminRoutes.delete('/super-admin/showcase/:id', async (req, res) => res.json(await removeShowcasePortrait(req.params.id)));
