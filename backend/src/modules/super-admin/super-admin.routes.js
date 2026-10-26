import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../shared/errors/api-error.js';
import { validate } from '../../shared/middleware/validate.js';
import { FEATURE_KEYS } from '../plans/plan.constants.js';
import { createPlan, deletePlan, listPlans, updatePlan } from '../plans/plan.service.js';
import { approveOrganization, changeOrganizationPlan, isSuperAdmin, listOrganizations, rejectOrganization } from './super-admin.service.js';

const rejectSchema = z.object({ reason: z.string().trim().max(500).optional() });
const setPlanSchema = z.object({ planId: z.string().uuid('Choose a plan') });

const limit = z.number().int().min(1, 'Use at least 1, or leave empty for unlimited').max(100000).nullable();
const planFields = z.object({
  name: z.string().trim().min(2, 'Plan name must be at least 2 characters').max(60),
  description: z.string().trim().max(300).nullable().optional(),
  priceLabel: z.string().trim().max(60).nullable().optional(),
  maxMembers: limit.optional(),
  maxProjects: limit.optional(),
  features: z.object(Object.fromEntries(FEATURE_KEYS.map((key) => [key, z.boolean().optional()]))).optional(),
  isDefault: z.boolean().optional(),
});
const updatePlanSchema = planFields.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one change');

function requireSuperAdmin(req, _res, next) {
  if (!isSuperAdmin(req.user)) throw ApiError.forbidden('Only the super admin can do this');
  next();
}

/** The portal owner reviews organizations and manages plans; works without belonging to any organization. */
const superAdminRoutes = Router();
superAdminRoutes.use('/super-admin', requireSuperAdmin);

superAdminRoutes.get('/super-admin/organizations', async (_req, res) => res.json({ organizations: await listOrganizations() }));
superAdminRoutes.post('/super-admin/organizations/:organizationId/approve', async (req, res) =>
  res.json({ organization: await approveOrganization(req.params.organizationId, req.user) }),
);
superAdminRoutes.post('/super-admin/organizations/:organizationId/reject', validate({ body: rejectSchema }), async (req, res) =>
  res.json({ organization: await rejectOrganization(req.params.organizationId, req.user, req.body) }),
);
superAdminRoutes.put('/super-admin/organizations/:organizationId/plan', validate({ body: setPlanSchema }), async (req, res) =>
  res.json({ organization: await changeOrganizationPlan(req.params.organizationId, req.body.planId) }),
);

superAdminRoutes.get('/super-admin/plans', async (_req, res) => res.json({ plans: await listPlans() }));
superAdminRoutes.post('/super-admin/plans', validate({ body: planFields }), async (req, res) => res.status(201).json({ plan: await createPlan(req.body) }));
superAdminRoutes.patch('/super-admin/plans/:planId', validate({ body: updatePlanSchema }), async (req, res) =>
  res.json({ plan: await updatePlan(req.params.planId, req.body) }),
);
superAdminRoutes.delete('/super-admin/plans/:planId', async (req, res) => {
  await deletePlan(req.params.planId);
  res.status(204).end();
});

export default superAdminRoutes;
