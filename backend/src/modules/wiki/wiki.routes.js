import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as service from './wiki.service.js';

const router = Router();
const feature = requireFeature('wiki');

const pageParams = z.object({ pageId: z.string().uuid() });
const createSchema = z.object({
  title: z.string().trim().min(1).max(150),
  body: z.string().max(50_000).optional(),
});
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().max(50_000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No changes' });

router.get('/wiki/pages', feature, async (_req, res) => {
  res.json({ pages: await service.listPages() });
});

router.post('/wiki/pages', feature, validate({ body: createSchema }), async (req, res) => {
  res.status(201).json({ page: await service.createPage(req.user, req.body) });
});

router.get('/wiki/pages/:pageId', feature, validate({ params: pageParams }), async (req, res) => {
  res.json({ page: await service.getPage(req.params.pageId) });
});

router.patch('/wiki/pages/:pageId', feature, validate({ params: pageParams, body: updateSchema }), async (req, res) => {
  res.json({ page: await service.updatePage(req.params.pageId, req.user, req.body) });
});

router.delete('/wiki/pages/:pageId', feature, validate({ params: pageParams }), async (req, res) => {
  res.json(await service.deletePage(req.params.pageId, req.user, { organizationRole: req.organizationRole }));
});

export default router;
