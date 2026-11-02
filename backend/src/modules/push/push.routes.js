import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import { pushPublicKey, removePushSubscription, savePushSubscription } from './push.service.js';

/**
 * The browsers' own push services. The server sends notifications to the address in a subscription, so only these
 * hosts are accepted: nobody can make the server send requests to an address of their choosing.
 */
const PUSH_HOSTS = [
  /(^|\.)push\.services\.mozilla\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)notify\.windows\.com$/,
  /(^|\.)push\.apple\.com$/,
];
const isPushService = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
};

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).refine(isPushService, 'This is not a browser push service address'),
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
