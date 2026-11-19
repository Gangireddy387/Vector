import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { AutomationRule, Project } from '../../database/models.js';
import { isCheckoutConfigured } from '../billing/billing.service.js';
import { checkSharedState, sharedStateKind } from '../../shared/realtime/shared-state.js';
import { signalsSnapshot } from '../../shared/ops/signals.js';

/** Portal-owner view of billing webhooks, background jobs and automation failures. */
export async function getOpsStatus() {
  const shared = await checkSharedState();
  const signals = signalsSnapshot();

  const [rulesWithErrors, failingRules] = await Promise.all([
    AutomationRule.count({ where: { lastError: { [Op.ne]: null } } }),
    AutomationRule.findAll({
      where: { lastError: { [Op.ne]: null } },
      attributes: ['id', 'name', 'projectId', 'lastError', 'lastRunAt', 'enabled'],
      order: [['lastRunAt', 'DESC']],
      limit: 20,
      include: [{ model: Project, as: 'project', attributes: ['id', 'name', 'key', 'organizationId'] }],
    }),
  ]);

  const stripeWebhook = signals.stripe.webhook ?? { ok: 0, failed: 0, lastOkAt: null, lastFailedAt: null, lastError: null };
  const jobFailures = Object.values(signals.jobs).reduce((total, row) => total + (row.failed || 0), 0);
  const jobsUnhealthy = Object.entries(signals.jobs)
    .filter(([, row]) => row.failed > 0 && (!row.lastOkAt || (row.lastFailedAt && row.lastFailedAt > row.lastOkAt)))
    .map(([name, row]) => ({ name, ...row }));

  return {
    time: new Date().toISOString(),
    process: {
      uptimeSec: Math.floor(process.uptime()),
      jobsEnabled: config.jobs.enabled,
      sharedState: sharedStateKind(),
      redisOk: !config.redis.url || shared.ok,
      checkoutConfigured: isCheckoutConfigured(),
      scope: 'This backend process only (counters reset on restart; several servers each keep their own)',
    },
    summary: {
      stripeWebhookFailures: stripeWebhook.failed,
      jobFailures,
      automationRulesWithErrors: rulesWithErrors,
      healthy: stripeWebhook.failed === 0 && jobsUnhealthy.length === 0 && rulesWithErrors === 0 && shared.ok,
    },
    stripe: {
      configured: isCheckoutConfigured(),
      webhook: stripeWebhook,
    },
    jobs: {
      enabled: config.jobs.enabled,
      byName: signals.jobs,
      unhealthy: jobsUnhealthy,
    },
    automations: {
      rulesWithErrors,
      failing: failingRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        lastError: rule.lastError,
        lastRunAt: rule.lastRunAt,
        project: rule.project
          ? { id: rule.project.id, name: rule.project.name, key: rule.project.key, organizationId: rule.project.organizationId }
          : null,
      })),
    },
    recent: signals.recent,
  };
}
