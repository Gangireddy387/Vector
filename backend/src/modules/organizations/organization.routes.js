import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { deleteMessage, getThread, markRead, sendMessage, setDisappearing } from '../support/support.service.js';
import { requireOrganization, requireOrganizationAdmin, requireOrganizationCreator } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './organization.controller.js';
import { logoUpload } from './organization.service.js';
import { createOrganizationSchema, deleteOrganizationSchema, inviteMemberSchema, slugQuery, updateMemberSchema, updateOrganizationSchema } from './organization.validation.js';

const lookupLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });

/** Public: signup checks an address while typing; /:slug links show which organization you are signing in to. */
export const publicOrganizationRoutes = Router();
publicOrganizationRoutes.get('/organizations/check-slug', lookupLimiter, validate({ query: slugQuery }), controller.checkSlug);
publicOrganizationRoutes.get('/organizations/by-slug/:slug', lookupLimiter, controller.showPublic);
/** <img> tags cannot send the bearer token, so logo files use unguessable names instead. */
publicOrganizationRoutes.get('/organization-logos/:fileName', controller.showLogo);

/** Signed in, no organization required: people without one create their first here. */
export const organizationRoutes = Router();
organizationRoutes.get('/organizations', controller.list);
organizationRoutes.post('/organizations', requireOrganizationCreator, validate({ body: createOrganizationSchema }), controller.create);
organizationRoutes.post('/organizations/:organizationId/switch', controller.switchTo);

/** The current organization's settings and people (organization admins). */
export const organizationAdminRoutes = Router();
organizationAdminRoutes.patch('/workspace', requireOrganizationAdmin, validate({ body: updateOrganizationSchema }), controller.update);
organizationAdminRoutes.delete('/workspace', requireOrganizationAdmin, validate({ body: deleteOrganizationSchema }), controller.remove);
organizationAdminRoutes.post('/workspace/logo', requireOrganizationAdmin, logoUpload, controller.uploadLogo);
organizationAdminRoutes.delete('/workspace/logo', requireOrganizationAdmin, controller.removeLogo);
organizationAdminRoutes.get('/workspace/plan', requireOrganization, controller.showPlan);
organizationAdminRoutes.get('/workspace/members', requireOrganizationAdmin, controller.listMembers);
organizationAdminRoutes.post('/workspace/invitations', requireOrganizationAdmin, validate({ body: inviteMemberSchema }), controller.invite);
/** Support chat with the portal's super admin; one conversation per organization, shared by its admins. */
const supportMessageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });
organizationAdminRoutes.get('/workspace/support', requireOrganizationAdmin, async (req, res) => res.json(await getThread(req.organization.id, 'organization')));
organizationAdminRoutes.post('/workspace/support', requireOrganizationAdmin, validate({ body: supportMessageSchema }), async (req, res) =>
  res.status(201).json(await sendMessage(req.organization.id, req.user, 'organization', req.body.body)),
);
organizationAdminRoutes.post('/workspace/support/read', requireOrganizationAdmin, async (req, res) =>
  res.json({ updated: await markRead(req.organization.id, 'organization', req.user) }),
);
organizationAdminRoutes.delete('/workspace/support/messages/:messageId', requireOrganizationAdmin, async (req, res) =>
  res.json({ message: await deleteMessage(req.organization.id, req.user, 'organization', req.params.messageId) }),
);
organizationAdminRoutes.put(
  '/workspace/support/disappearing',
  requireOrganizationAdmin,
  validate({ body: z.object({ hours: z.union([z.literal(24), z.literal(168), z.null()]) }) }),
  async (req, res) => res.json(await setDisappearing(req.organization.id, req.user, 'organization', req.body.hours)),
);
organizationAdminRoutes.get('/workspace/members/:userId/profile', requireOrganizationAdmin, controller.showMemberProfile);
organizationAdminRoutes.patch('/workspace/members/:userId', requireOrganizationAdmin, validate({ body: updateMemberSchema }), controller.updateMember);
organizationAdminRoutes.delete('/workspace/members/:userId', requireOrganizationAdmin, controller.removeMember);
