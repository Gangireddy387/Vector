import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './auth.controller.js';
import {
  acceptInviteQuickSchema,
  acceptInviteSchema,
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  mfaConfirmSchema,
  mfaDisableSchema,
  mfaLoginSchema,
  mfaRegenerateSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './auth.validation.js';

const router = Router();
const credentialLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false });
/** Guessing one person's password from many addresses: at most 10 wrong tries per email per 15 minutes. */
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `login:${String(req.body?.email ?? '').trim().toLowerCase()}`,
  message: { message: 'Too many sign-in attempts for this account. Wait 15 minutes or reset your password.' },
});
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `mfa:${String(req.body?.mfaToken ?? req.user?.id ?? req.ip).slice(0, 80)}`,
  message: { message: 'Too many authenticator attempts. Wait a few minutes and try again.' },
});

router.post('/register', credentialLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', credentialLimiter, validate({ body: loginSchema }), accountLimiter, controller.login);
router.post('/login/mfa', credentialLimiter, validate({ body: mfaLoginSchema }), mfaLimiter, controller.verifyMfaLogin);
router.post('/forgot-password', credentialLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', credentialLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);
router.post('/accept-invite', credentialLimiter, validate({ body: acceptInviteSchema }), controller.acceptInvite);
/** One click from the invitation email: the account is set up with a temporary password (shown once and emailed). */
router.post('/accept-invite/quick', credentialLimiter, validate({ body: acceptInviteQuickSchema }), controller.acceptInviteQuick);

router.get('/me', authenticate, controller.me);
router.get('/me/export', authenticate, controller.exportAccount);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), controller.updateProfile);
router.patch('/me/password', authenticate, validate({ body: changePasswordSchema }), controller.changePassword);
router.post('/me/sessions/revoke-others', authenticate, controller.revokeOtherSessions);
router.post('/me/mfa/setup', authenticate, controller.setupMfa);
router.post('/me/mfa/confirm', authenticate, validate({ body: mfaConfirmSchema }), mfaLimiter, controller.confirmMfa);
router.post('/me/mfa/disable', authenticate, validate({ body: mfaDisableSchema }), mfaLimiter, controller.disableMfa);
router.post('/me/mfa/recovery', authenticate, validate({ body: mfaRegenerateSchema }), mfaLimiter, controller.regenerateMfaRecovery);
router.get('/me/tokens', authenticate, controller.listApiTokens);
router.post(
  '/me/tokens',
  authenticate,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(80),
      expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
    }),
  }),
  controller.createApiToken,
);
router.delete('/me/tokens/:tokenId', authenticate, controller.revokeApiToken);
router.delete('/me', authenticate, validate({ body: deleteAccountSchema }), controller.deleteAccount);

export default router;
