import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import * as service from './share.service.js';

/**
 * Public share links: people outside the organization open /share/<token>.
 * Optional password unlock + guest comments on issue shares.
 */

const readLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
const submitLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

const unlockSchema = z.object({
  password: z.string().min(1).max(72),
});

const commentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  body: z.string().trim().min(1).max(10_000),
  /** Honeypot — bots fill this; humans leave it empty. */
  company: z.string().max(200).optional(),
});

export const publicShareRoutes = Router();

publicShareRoutes.get('/share-links/:token', readLimiter, async (req, res) => {
  res.json(await service.getPublicShare(req.params.token, req.headers.authorization));
});

publicShareRoutes.post('/share-links/:token/unlock', readLimiter, validate({ body: unlockSchema }), async (req, res) => {
  res.json(await service.unlockPublicShare(req.params.token, req.body.password));
});

publicShareRoutes.post(
  '/share-links/:token/comments',
  submitLimiter,
  validate({ body: commentSchema }),
  async (req, res) => {
    if (req.body.company) {
      return res.status(201).json({
        id: '00000000-0000-0000-0000-000000000000',
        body: req.body.body,
        createdAt: new Date().toISOString(),
        authorName: req.body.name,
        isGuest: true,
      });
    }
    res.status(201).json(
      await service.createPublicShareComment(req.params.token, req.headers.authorization, {
        name: req.body.name,
        body: req.body.body,
      }),
    );
  },
);
