import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as service from './calendar-sync.service.js';

/** Connecting a Google or Microsoft calendar to your account (it is yours, in every organization you belong to). */
export const calendarSyncRoutes = Router();

calendarSyncRoutes.get('/calendar-sync/connections', async (req, res) => res.json({ calendars: await service.listConnections(req.user.id) }));
calendarSyncRoutes.post('/calendar-sync/:provider/connect', (req, res) => res.json({ url: service.connectUrl(req.user.id, req.params.provider) }));
calendarSyncRoutes.delete('/calendar-sync/:provider', async (req, res) => {
  await service.disconnect(req.user.id, req.params.provider);
  res.status(204).end();
});

/** Public: the provider sends the browser back here; the signed `state` says whose calendar it is. */
export const publicCalendarSyncRoutes = Router();

publicCalendarSyncRoutes.get('/calendar/oauth/:provider/callback', rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false }), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.redirect(303, await service.completeOAuth(req.params.provider, req.query));
});
