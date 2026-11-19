import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/middleware/validate.js';
import * as oauth from './auth-oauth.service.js';

const providerParam = z.object({ provider: z.enum(['google', 'microsoft']) });

/** Public Google / Microsoft sign-in. */
export const publicAuthOAuthRoutes = Router();

publicAuthOAuthRoutes.get('/auth/oauth/providers', (_req, res) => res.json(oauth.oauthProvidersStatus()));

publicAuthOAuthRoutes.get(
  '/auth/oauth/:provider/start',
  validate({
    params: providerParam,
    query: z.object({
      redirect: z.string().max(300).optional(),
      organizationSlug: z.string().trim().max(80).optional(),
      microsoftTenant: z.string().trim().max(64).optional(),
    }),
  }),
  async (req, res) => {
    res.json(
      await oauth.startOAuthLogin(req.params.provider, {
        redirect: req.filters?.redirect,
        organizationSlug: req.filters?.organizationSlug,
        microsoftTenant: req.filters?.microsoftTenant,
      }),
    );
  },
);

publicAuthOAuthRoutes.get('/auth/oauth/:provider/callback', validate({ params: providerParam }), async (req, res) => {
  const url = await oauth.completeOAuthLogin(req.params.provider, {
    code: req.query.code,
    state: req.query.state,
    error: req.query.error,
  });
  res.redirect(url);
});
