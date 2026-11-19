import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { clearThread, deleteMessage, editMessage, getThread, hideMessage, markRead, sendMessage, setDisappearing } from '../support/support.service.js';
import {
  requireAnyOrgPermission,
  requireOrganization,
  requireOrganizationAdmin,
  requireOrganizationCreator,
  requireOrgPermission,
} from '../../shared/middleware/authenticate.js';
import { requireFeature } from '../plans/plan.service.js';
import { validate } from '../../shared/middleware/validate.js';
import * as controller from './organization.controller.js';
import { logoUpload } from './organization.service.js';
import * as roleController from './organization-role.controller.js';
import { createOrganizationRoleSchema, updateOrganizationRoleSchema } from './organization-role.validation.js';
import { createOrganizationSchema, deleteOrganizationSchema, inviteMemberSchema, slugQuery, updateMemberSchema, updateOrganizationSchema } from './organization.validation.js';
import { exportAuditLogCsv, listAuditLog } from '../workspace/workspace-audit.service.js';
import { backupUpload } from './workspace-backup-import.service.js';

const lookupLimiter = rateLimit({ windowMs: 60 * 1000, limit: 60, standardHeaders: true, legacyHeaders: false });
/** Full org backups are heavy — a few downloads / restores per hour is enough for offboarding. */
const backupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

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

/** The current organization's settings and people (organization admins + delegated roles). */
export const organizationAdminRoutes = Router();
organizationAdminRoutes.patch('/workspace', requireOrgPermission('workspace.manage'), validate({ body: updateOrganizationSchema }), controller.update);
organizationAdminRoutes.delete('/workspace', requireOrganizationAdmin, validate({ body: deleteOrganizationSchema }), controller.remove);
organizationAdminRoutes.post('/workspace/logo', requireOrgPermission('workspace.manage'), logoUpload, controller.uploadLogo);
organizationAdminRoutes.delete('/workspace/logo', requireOrgPermission('workspace.manage'), controller.removeLogo);
organizationAdminRoutes.get('/workspace/plan', requireOrganization, controller.showPlan);
organizationAdminRoutes.get('/workspace/metrics/workday-nudges', requireOrgPermission('workspace.billing'), controller.showWorkdayNudgeMetrics);
organizationAdminRoutes.post(
  '/workspace/plan/upgrade-request',
  requireOrgPermission('workspace.billing'),
  validate({
    body: z.object({
      target: z.enum(['pro', 'enterprise', 'seats', 'projects']),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  controller.requestUpgrade,
);

organizationAdminRoutes.get(
  '/workspace/roles/permissions',
  requireAnyOrgPermission('workspace.roles', 'workspace.people'),
  roleController.catalog,
);
organizationAdminRoutes.get(
  '/workspace/roles',
  requireAnyOrgPermission('workspace.roles', 'workspace.people'),
  roleController.list,
);
organizationAdminRoutes.post(
  '/workspace/roles',
  requireFeature('customRoles'),
  requireOrgPermission('workspace.roles'),
  validate({ body: createOrganizationRoleSchema }),
  roleController.create,
);
organizationAdminRoutes.patch(
  '/workspace/roles/:roleId',
  requireFeature('customRoles'),
  requireOrgPermission('workspace.roles'),
  validate({ body: updateOrganizationRoleSchema }),
  roleController.update,
);
organizationAdminRoutes.delete(
  '/workspace/roles/:roleId',
  requireFeature('customRoles'),
  requireOrgPermission('workspace.roles'),
  roleController.remove,
);

organizationAdminRoutes.get('/workspace/members', requireOrgPermission('workspace.people'), controller.listMembers);
organizationAdminRoutes.get(
  '/workspace/audit-log',
  requireOrgPermission('workspace.audit'),
  validate({
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      before: z.string().trim().min(1).max(40).optional(),
    }),
  }),
  async (req, res) => res.json(await listAuditLog(req.organization.id, req.filters)),
);
organizationAdminRoutes.get('/workspace/audit-log/export', requireOrgPermission('workspace.audit'), async (req, res) => {
  const csv = await exportAuditLogCsv(req.organization.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="vector-audit-log.csv"');
  res.send(csv);
});
organizationAdminRoutes.get('/workspace/backup', requireOrgPermission('workspace.audit'), backupLimiter, controller.exportBackup);
organizationAdminRoutes.post(
  '/workspace/backup/import',
  requireOrgPermission('workspace.audit'),
  backupLimiter,
  (req, res, next) => {
    backupUpload(req, res, (error) => {
      if (error) return next(error);
      return next();
    });
  },
  controller.importBackup,
);
organizationAdminRoutes.post('/workspace/invitations', requireOrgPermission('workspace.people'), validate({ body: inviteMemberSchema }), controller.invite);
/** Support chat with the portal's super admin; one conversation per organization, shared by its admins. */
const supportMessageSchema = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000) });
organizationAdminRoutes.get('/workspace/support', requireOrgPermission('workspace.support'), async (req, res) =>
  res.json(await getThread(req.organization.id, 'organization', req.user.id)),
);
organizationAdminRoutes.post('/workspace/support', requireOrgPermission('workspace.support'), validate({ body: supportMessageSchema }), async (req, res) =>
  res.status(201).json(await sendMessage(req.organization.id, req.user, 'organization', req.body.body)),
);
organizationAdminRoutes.post('/workspace/support/read', requireOrgPermission('workspace.support'), async (req, res) =>
  res.json({ updated: await markRead(req.organization.id, 'organization', req.user) }),
);
organizationAdminRoutes.patch('/workspace/support/messages/:messageId', requireOrgPermission('workspace.support'), validate({ body: supportMessageSchema }), async (req, res) =>
  res.json({ message: await editMessage(req.organization.id, req.user, 'organization', req.params.messageId, req.body.body) }),
);
organizationAdminRoutes.delete('/workspace/support/messages/:messageId', requireOrgPermission('workspace.support'), async (req, res) =>
  res.json({ message: await deleteMessage(req.organization.id, req.user, 'organization', req.params.messageId) }),
);
organizationAdminRoutes.post('/workspace/support/messages/:messageId/hide', requireOrgPermission('workspace.support'), async (req, res) => {
  await hideMessage(req.organization.id, req.user, req.params.messageId);
  res.status(204).end();
});
organizationAdminRoutes.post('/workspace/support/clear', requireOrgPermission('workspace.support'), async (req, res) =>
  res.json(await clearThread(req.organization.id, req.user, 'organization')),
);
organizationAdminRoutes.put(
  '/workspace/support/disappearing',
  requireOrgPermission('workspace.support'),
  validate({ body: z.object({ hours: z.union([z.literal(24), z.literal(168), z.null()]) }) }),
  async (req, res) => res.json(await setDisappearing(req.organization.id, req.user, 'organization', req.body.hours)),
);
organizationAdminRoutes.get('/workspace/members/:userId/profile', requireOrgPermission('workspace.people'), controller.showMemberProfile);
organizationAdminRoutes.patch('/workspace/members/:userId', requireOrgPermission('workspace.people'), validate({ body: updateMemberSchema }), controller.updateMember);
organizationAdminRoutes.delete('/workspace/members/:userId', requireOrgPermission('workspace.people'), controller.removeMember);
/** A fresh invitation for someone who has not accepted yet (the old link stops working). */
organizationAdminRoutes.post('/workspace/members/:userId/resend-invitation', requireOrgPermission('workspace.people'), controller.resendInvitation);
