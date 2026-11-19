import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as service from './share.service.js';

/**
 * Public share links: people outside the organization open /share/<token> and see a read-only board or issue.
 */

const shareLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

export const publicShareRoutes = Router();

publicShareRoutes.get('/share-links/:token', shareLimiter, async (req, res) => {
  res.json(await service.getPublicShare(req.params.token));
});
