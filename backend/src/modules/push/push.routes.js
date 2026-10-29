import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { pushPublicKey, removePushSubscription, savePushSubscription } from './push.service.js';

const subscriptionSchema = z.object({
  endpoint: z.string().url().startsWith('https://').max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }),
});
const removeSchema = z.object({ endpoint: z.string().max(2000) });

/** Lets a browser or the installed app ring for calls (and other alerts) while Vector is closed. */
const router = Router();

router.get('/push/public-key', (_req, res) => res.json({ publicKey: pushPublicKey() }));
router.post('/push/subscriptions', validate({ body: subscriptionSchema }), async (req, res) => {
  await savePushSubscription(req.user.id, req.body, req.headers['user-agent']);
  res.status(204).end();
});
router.delete('/push/subscriptions', validate({ body: removeSchema }), async (req, res) => {
  await removePushSubscription(req.user.id, req.body.endpoint);
  res.status(204).end();
});

export default router;
