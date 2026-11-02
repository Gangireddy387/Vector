import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './auth.controller.js';
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
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

router.post('/register', credentialLimiter, validate({ body: registerSchema }), controller.register);
router.post('/login', credentialLimiter, validate({ body: loginSchema }), accountLimiter, controller.login);
router.post('/forgot-password', credentialLimiter, validate({ body: forgotPasswordSchema }), controller.forgotPassword);
router.post('/reset-password', credentialLimiter, validate({ body: resetPasswordSchema }), controller.resetPassword);
router.post('/accept-invite', credentialLimiter, validate({ body: acceptInviteSchema }), controller.acceptInvite);

router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, validate({ body: updateProfileSchema }), controller.updateProfile);
router.patch('/me/password', authenticate, validate({ body: changePasswordSchema }), controller.changePassword);

export default router;
