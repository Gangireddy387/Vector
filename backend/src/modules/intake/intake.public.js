import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { ISSUE_PRIORITIES } from '../issues/issue.model.js';
import * as service from './intake.service.js';

/**
 * Public request forms: people outside the organization open /request/<token> and submit work.
 */

const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const submitSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(190),
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(10_000).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  /** Honeypot — bots fill this; humans leave it empty. */
  company: z.string().max(200).optional(),
});

export const publicIntakeRoutes = Router();

publicIntakeRoutes.get('/intake-forms/:token', readLimiter, async (req, res) => {
  res.json(await service.getPublicIntake(req.params.token));
});

publicIntakeRoutes.post('/intake-forms/:token/submissions', submitLimiter, validate({ body: submitSchema }), async (req, res) => {
  if (req.body.company) {
    // Pretend success so scrapers do not learn the honeypot failed.
    return res.status(201).json({ key: 'OK-0', title: req.body.title, project: { key: 'OK', name: 'Thanks' } });
  }
  res.status(201).json(await service.submitPublicIntake(req.params.token, req.body));
});
