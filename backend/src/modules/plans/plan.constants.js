/** Features a plan can switch on or off. Keys are shared with the frontend (src/lib/plan-features.ts). */
export const PLAN_FEATURES = [
  { key: 'aiAssistant', label: 'AI assistant' },
  { key: 'automations', label: 'Automation rules' },
  { key: 'recurringTasks', label: 'Recurring tasks' },
  { key: 'templates', label: 'Issue templates' },
  { key: 'customFields', label: 'Custom fields' },
  { key: 'customRoles', label: 'Custom roles' },
  { key: 'reports', label: 'Reports & progress' },
  { key: 'roadmap', label: 'Roadmap & timeline' },
  { key: 'goals', label: 'Goals & OKRs' },
  { key: 'portfolio', label: 'Portfolio view' },
  /** Project versions with fix/affected links and markdown release notes. */
  { key: 'releases', label: 'Releases & versions' },
  /** Organization-wide markdown wiki pages. */
  { key: 'wiki', label: 'Shared docs & wiki' },
  { key: 'chat', label: 'Team chat & standups' },
  { key: 'directMessages', label: 'Direct messages' },
  { key: 'teamChat', label: 'Team & department chat' },
  { key: 'meetings', label: 'Meetings & video calls' },
  { key: 'calendar', label: 'Calendar & due-date sync' }, // personal calendar + assignee due events
  { key: 'attachments', label: 'File attachments' },
  { key: 'timeTracking', label: 'Time tracking' },
  { key: 'customSounds', label: 'Custom ringtones & sounds' },
  /** Slack Incoming Webhooks + Teams Incoming Webhooks for work events. */
  { key: 'channelNotifications', label: 'Slack & Teams notifications' },
  /** Paste GitHub / GitLab issue and PR URLs on Vector tasks. */
  { key: 'vcsLinks', label: 'GitHub & GitLab links' }, // inbound GitHub + GitLab webhook sync included
  /** Signed HTTPS webhooks for issue, comment and sprint events. */
  { key: 'webhooks', label: 'Outbound webhooks' },
  /** Two-key embed: partners open the full workspace inside their own product. */
  { key: 'embedWorkspace', label: 'Workspace embed' },
  /** Guest links so people outside the organization can view a board or issue (read-only). */
  { key: 'publicShare', label: 'Public share links' },
  /** Public request forms that create tasks without requiring a Vector account. */
  { key: 'intakeForms', label: 'Request forms' },
  /** Force Google/Microsoft/OIDC sign-in and optional Azure AD tenant lock (Enterprise). */
  { key: 'sso', label: 'Enterprise SSO' },
  /** SCIM 2.0 user provisioning for IdPs (Enterprise). */
  { key: 'scim', label: 'SCIM provisioning' },
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
    description: 'Workday loop plus project basics: templates, recurring tasks and reports.',
    priceLabel: 'Free',
    maxMembers: 10,
    maxProjects: 5,
    // Free covers the workday loop, enough PM to run a real project, and invite emails; Pro sells automation, AI and volume email.
    features: features(
      'attachments',
      'timeTracking',
      'chat',
      'directMessages',
      'teamChat',
      'meetings',
      'calendar',
      'templates',
      'recurringTasks',
      'reports',
      'emailInvitations',
    ),
    isDefault: true,
    position: 0,
  },
  {
    name: 'Pro',
    description: 'For growing teams that want to automate their work.',
    priceLabel: '₹999 / month',
    maxMembers: 25,
    maxProjects: 20,
    features: features('aiAssistant', 'automations', 'recurringTasks', 'templates', 'customFields', 'customRoles', 'reports', 'roadmap', 'goals', 'portfolio', 'releases', 'wiki', 'chat', 'directMessages', 'teamChat', 'meetings', 'calendar', 'attachments', 'timeTracking', 'customSounds', 'channelNotifications', 'vcsLinks', 'webhooks', 'embedWorkspace', 'publicShare', 'intakeForms', ...EMAIL_FEATURE_KEYS),
    isDefault: false,
    position: 1,
  },
  {
    name: 'Enterprise',
    description: 'Everything, with no limits.',
    priceLabel: '₹2499 / month',
    maxMembers: null,
    maxProjects: null,
    features: ALL_FEATURES,
    isDefault: false,
    position: 2,
  },
];
