import { Organization, OrganizationMember, Plan, Project } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { ALL_FEATURES, DEFAULT_PLANS, EMAIL_FEATURE_KEYS, FEATURE_KEYS, featureLabel } from './plan.constants.js';

const planInclude = { model: Plan, as: 'plan' };
export const withPlan = () => [planInclude];

const normalizeFeatures = (features = {}) => Object.fromEntries(FEATURE_KEYS.map((key) => [key, Boolean(features[key])]));

/**
 * What an organization may use. Organizations without a plan (created before plans existed and never assigned)
 * keep full access. `organization.plan` must be loaded.
 */
export function entitlementsFor(organization) {
  const plan = organization?.plan;
  if (!plan) return { planId: null, planName: null, features: { ...ALL_FEATURES }, limits: { members: null, projects: null } };
  return {
    planId: plan.id,
    planName: plan.name,
    features: normalizeFeatures(plan.features),
    limits: { members: plan.maxMembers ?? null, projects: plan.maxProjects ?? null },
  };
}

const loadOrganization = (organizationId) => Organization.findByPk(organizationId, { include: withPlan() });

export function assertFeature(organization, key) {
  const entitlements = entitlementsFor(organization);
  if (entitlements.features[key]) return;
  throw new ApiError(403, `The ${entitlements.planName} plan does not include ${featureLabel(key).toLowerCase()}. Ask the portal administrator to upgrade.`, {
    code: 'plan_feature',
    feature: key,
  });
}

/** Route guard for a plan feature in the current organization (`req.organization` comes with its plan). */
export const requireFeature = (key) => (req, _res, next) => {
  assertFeature(req.organization, key);
  next();
};

/** Background work (automation rules, recurring tasks, emails) only runs for organizations whose plan includes it. */
export async function projectHasFeature(projectId, key) {
  const project = await Project.findByPk(projectId, { attributes: ['id', 'organizationId'] });
  if (!project?.organizationId) return true;
  return entitlementsFor(await loadOrganization(project.organizationId)).features[key];
}

export async function usageFor(organizationId) {
  const [members, projects] = await Promise.all([
    OrganizationMember.count({ where: { organizationId, status: 'active' } }),
    Project.count({ where: { organizationId, archivedAt: null } }),
  ]);
  return { members, projects };
}

/** Throws when adding one more person or project would go over the organization's plan. */
export async function assertWithinLimit(organizationId, kind) {
  const organization = await loadOrganization(organizationId);
  const { planName, limits } = entitlementsFor(organization);
  const limit = limits[kind];
  if (limit === null || limit === undefined) return;
  const usage = await usageFor(organizationId);
  if (usage[kind] < limit) return;
  const noun = kind === 'members' ? (limit === 1 ? 'person' : 'people') : limit === 1 ? 'project' : 'projects';
  throw new ApiError(403, `The ${planName} plan allows up to ${limit} ${noun}. Ask the portal administrator to upgrade.`, {
    code: 'plan_limit',
    limit: kind,
  });
}

export async function getDefaultPlan() {
  return (await Plan.findOne({ where: { isDefault: true } })) ?? (await Plan.findOne({ order: [['position', 'ASC']] }));
}

/** Plans saved before the email switches existed keep sending those emails until the super admin turns them off. */
async function backfillEmailFeatures() {
  for (const plan of await Plan.findAll()) {
    const features = plan.features ?? {};
    const missing = EMAIL_FEATURE_KEYS.filter((key) => features[key] === undefined);
    if (missing.length) await plan.update({ features: { ...features, ...Object.fromEntries(missing.map((key) => [key, true])) } });
  }
}

/**
 * Creates the starter plans on first start. Organizations that already exist move to the plan with the most
 * access, so nobody loses a feature they were using.
 */
export async function ensureDefaultPlans() {
  if (await Plan.count()) return backfillEmailFeatures();
  const plans = await Plan.bulkCreate(DEFAULT_PLANS);
  const fullAccess = plans.find((plan) => plan.maxMembers === null && plan.maxProjects === null) ?? plans.at(-1);
  const [moved] = await Organization.update({ planId: fullAccess.id }, { where: { planId: null } });
  console.info(`[plans] created ${plans.length} starter plans${moved ? `; ${moved} existing organizations moved to ${fullAccess.name}` : ''}`);
}

// --- Super admin ---------------------------------------------------------------

const toPlan = (plan, organizationCount = 0) => ({
  id: plan.id,
  name: plan.name,
  description: plan.description,
  priceLabel: plan.priceLabel,
  maxMembers: plan.maxMembers,
  maxProjects: plan.maxProjects,
  features: normalizeFeatures(plan.features),
  isDefault: plan.isDefault,
  position: plan.position,
  organizationCount,
});

export async function listPlans() {
  const [plans, organizations] = await Promise.all([
    Plan.findAll({ order: [['position', 'ASC'], ['createdAt', 'ASC']] }),
    Organization.findAll({ attributes: ['planId'], raw: true }),
  ]);
  return plans.map((plan) => toPlan(plan, organizations.filter((row) => row.planId === plan.id).length));
}

async function planWithCount(plan) {
  return toPlan(plan, await Organization.count({ where: { planId: plan.id } }));
}

async function clearOtherDefaults(planId) {
  const others = await Plan.findAll({ where: { isDefault: true } });
  for (const other of others) if (other.id !== planId) await other.update({ isDefault: false });
}

export async function createPlan(input) {
  const position = ((await Plan.max('position')) ?? -1) + 1;
  const plan = await Plan.create({ ...input, features: normalizeFeatures(input.features), position });
  if (plan.isDefault) await clearOtherDefaults(plan.id);
  return planWithCount(plan);
}

export async function updatePlan(planId, changes) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw ApiError.notFound('Plan not found');
  if (changes.isDefault === false && plan.isDefault) throw ApiError.badRequest('Make another plan the default first');
  const updates = { ...changes };
  if (changes.features) updates.features = normalizeFeatures({ ...plan.features, ...changes.features });
  await plan.update(updates);
  if (plan.isDefault) await clearOtherDefaults(plan.id);
  return planWithCount(plan);
}

export async function deletePlan(planId) {
  const plan = await Plan.findByPk(planId);
  if (!plan) throw ApiError.notFound('Plan not found');
  if (plan.isDefault) throw ApiError.badRequest('The default plan cannot be deleted. Make another plan the default first.');
  const inUse = await Organization.count({ where: { planId } });
  if (inUse) throw ApiError.badRequest(`${inUse} organization${inUse === 1 ? ' is' : 's are'} on this plan. Move them to another plan first.`);
  await plan.destroy();
}

/** Moves an organization to another plan; returns it with its plan loaded. */
export async function setOrganizationPlan(organizationId, planId) {
  const [organization, plan] = await Promise.all([Organization.findByPk(organizationId), Plan.findByPk(planId)]);
  if (!organization) throw ApiError.notFound('Organization not found');
  if (!plan) throw ApiError.notFound('Plan not found');
  await organization.update({ planId });
  return loadOrganization(organizationId);
}
