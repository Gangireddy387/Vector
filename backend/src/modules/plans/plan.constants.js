/** Features a plan can switch on or off. Keys are shared with the frontend (src/lib/plan-features.ts). */
export const PLAN_FEATURES = [
  { key: 'aiAssistant', label: 'AI assistant' },
  { key: 'automations', label: 'Automation rules' },
  { key: 'recurringTasks', label: 'Recurring tasks' },
  { key: 'templates', label: 'Issue templates' },
  { key: 'reports', label: 'Reports & progress' },
  { key: 'chat', label: 'Team chat & standups' },
  { key: 'directMessages', label: 'Direct messages' },
  { key: 'teamChat', label: 'Team & department chat' },
  { key: 'attachments', label: 'File attachments' },
  { key: 'timeTracking', label: 'Time tracking' },
  // Emails that grow with usage (SendGrid volume). Password reset, added-to-organization and approval emails always send.
  { key: 'emailInvitations', label: 'Invitation emails', group: 'email' },
  { key: 'emailNotifications', label: 'Work notification emails', group: 'email' },
  { key: 'emailReminders', label: 'Due date reminder emails', group: 'email' },
  { key: 'emailDigest', label: 'Daily digest emails', group: 'email' },
  { key: 'emailAutomations', label: 'Automation emails', group: 'email' },
];

export const FEATURE_KEYS = PLAN_FEATURES.map((feature) => feature.key);
export const EMAIL_FEATURE_KEYS = PLAN_FEATURES.filter((feature) => feature.group === 'email').map((feature) => feature.key);
export const featureLabel = (key) => PLAN_FEATURES.find((feature) => feature.key === key)?.label ?? key;

const features = (...enabled) => Object.fromEntries(FEATURE_KEYS.map((key) => [key, enabled.includes(key)]));
export const ALL_FEATURES = features(...FEATURE_KEYS);

/** Created the first time the server starts; the super admin can change or replace them. */
export const DEFAULT_PLANS = [
  {
    name: 'Free',
    description: 'For small teams getting started.',
    priceLabel: 'Free',
    maxMembers: 5,
    maxProjects: 2,
    features: features('attachments', 'timeTracking'),
    isDefault: true,
    position: 0,
  },
  {
    name: 'Pro',
    description: 'For growing teams that want to automate their work.',
    priceLabel: '₹999 / month',
    maxMembers: 25,
    maxProjects: 20,
    features: features('automations', 'recurringTasks', 'templates', 'reports', 'chat', 'directMessages', 'teamChat', 'attachments', 'timeTracking', ...EMAIL_FEATURE_KEYS),
    isDefault: false,
    position: 1,
  },
  {
    name: 'Enterprise',
    description: 'Everything, with no limits.',
    priceLabel: 'Contact us',
    maxMembers: null,
    maxProjects: null,
    features: ALL_FEATURES,
    isDefault: false,
    position: 2,
  },
];
