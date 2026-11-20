import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { requireFeature } from '../plans/plan.service.js';
import * as ai from './wiki.ai.js';
import * as service from './wiki.service.js';

const router = Router();
const feature = requireFeature('wiki');
const aiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });

const pageParams = z.object({ pageId: z.string().uuid() });
const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
});
const createSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().max(50_000).optional(),
    templateId: z.string().trim().max(40).optional(),
  })
  .refine((body) => Boolean(body.title?.trim() || body.templateId), { message: 'Give the page a title or pick a template' });
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(150).optional(),
    body: z.string().max(50_000).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'No changes' });
const generateSchema = z.object({
  kind: z.enum(['handbook', 'runbook', 'meeting-notes', 'faq', 'project-brief', 'how-to', 'custom']).default('custom'),
  brief: z.string().trim().max(2000).optional().default(''),
  title: z.string().trim().max(150).optional(),
});
const fillSchema = z.object({
  brief: z.string().trim().max(1500).optional().default(''),
});

router.get('/wiki/pages', feature, validate({ query: listQuery }), async (req, res) => {
  res.json({ pages: await service.listPages({ q: req.filters?.q }) });
});

router.get('/wiki/templates', feature, async (_req, res) => {
  res.json({ templates: await service.listTemplates() });
});

/** AI-first: short brief → finished page (uses org people/projects as context). */
router.post('/wiki/ai/generate', feature, aiLimiter, validate({ body: generateSchema }), async (req, res) => {
  const result = await ai.generateWikiPage(req.user, req.body);
  res.status(201).json(result);
});

router.post('/wiki/pages', feature, validate({ body: createSchema }), async (req, res) => {
  res.status(201).json({ page: await service.createPage(req.user, req.body) });
});

router.get('/wiki/pages/:pageId', feature, validate({ params: pageParams }), async (req, res) => {
  res.json({ page: await service.getPage(req.params.pageId, req.user.id) });
});

router.patch('/wiki/pages/:pageId', feature, validate({ params: pageParams, body: updateSchema }), async (req, res) => {
  res.json({ page: await service.updatePage(req.params.pageId, req.user, req.body) });
});

/** Finish placeholders / polish a draft into a readable page. */
router.post('/wiki/pages/:pageId/ai/fill', feature, aiLimiter, validate({ params: pageParams, body: fillSchema }), async (req, res) => {
  res.json(await ai.fillWikiPage(req.user, req.params.pageId, req.body));
});

router.delete('/wiki/pages/:pageId', feature, validate({ params: pageParams }), async (req, res) => {
  res.json(await service.deletePage(req.params.pageId, req.user, { organizationRole: req.organizationRole }));
});

export default router;
