/**
 * Org-scoped permissions for custom roles.
 * Built-in `admin` always has every permission; `member` has none unless a custom role is assigned.
 */
export const ORG_PERMISSIONS = [
  {
    key: 'workspace.manage',
    label: 'Manage organization',
    description: 'Name, branding, MFA/SSO, delete organization',
  },
  {
    key: 'workspace.people',
    label: 'Manage people',
    description: 'Invite, promote, deactivate and remove people',
  },
  {
    key: 'workspace.roles',
    label: 'Manage roles',
    description: 'Create and edit custom roles',
  },
  {
    key: 'workspace.billing',
    label: 'Billing & plan',
    description: 'Checkout, seats, upgrade requests',
  },
  {
    key: 'workspace.structure',
    label: 'Departments & teams',
    description: 'Create and edit departments and teams',
  },
  {
    key: 'workspace.audit',
    label: 'Audit & backup',
    description: 'View activity log and download workspace backup',
  },
  {
    key: 'workspace.support',
    label: 'Vector support',
    description: 'Chat with portal support',
  },
  {
    key: 'project.create',
    label: 'Create projects',
    description: 'Create projects for teams (org-wide)',
  },
];

export const ORG_PERMISSION_KEYS = ORG_PERMISSIONS.map((item) => item.key);

/** Full admin set — never assign `workspace.manage` lightly on custom roles without people/roles too. */
export const ALL_ORG_PERMISSIONS = [...ORG_PERMISSION_KEYS];
