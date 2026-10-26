import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireOrganizationAdmin, requireOrganizationCreator } from '../../shared/middleware/authenticate.js';
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
organizationAdminRoutes.get('/workspace/members', requireOrganizationAdmin, controller.listMembers);
organizationAdminRoutes.post('/workspace/invitations', requireOrganizationAdmin, validate({ body: inviteMemberSchema }), controller.invite);
organizationAdminRoutes.patch('/workspace/members/:userId', requireOrganizationAdmin, validate({ body: updateMemberSchema }), controller.updateMember);
organizationAdminRoutes.delete('/workspace/members/:userId', requireOrganizationAdmin, controller.removeMember);
