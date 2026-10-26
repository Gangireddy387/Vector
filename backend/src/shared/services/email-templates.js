import { config } from '../../config/index.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const appUrl = (path = '/') => `${config.clientUrl.split(',')[0].replace(/\/$/, '')}${path}`;

/** Mail clients fetch images through their own servers, so images on a local address would show as broken. */
const canLoadImages = () => !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(appUrl());

const FONT = "'Segoe UI',-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif";
const BRAND = '#4f46e5';
/** Same palette and pick as the organization tiles in the app's switcher. */
const TILE_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6'];
const tileColor = (seed) => TILE_COLORS[[...String(seed)].reduce((total, char) => total + char.charCodeAt(0), 0) % TILE_COLORS.length];

const PROJECT_ROLE_DETAILS = {
  admin: { label: 'Admin', description: 'Manage the project, its people and settings' },
  member: { label: 'Member', description: 'Create, update and comment on work' },
  viewer: { label: 'Viewer', description: 'See all of the project’s work' },
};
const ORGANIZATION_ROLE_DETAILS = {
  admin: { label: 'Admin', description: 'Manage the organization, its people and settings' },
  member: { label: 'Member', description: 'Join projects and work with the team' },
};
const PROJECT_TYPES = { scrum: 'Scrum', kanban: 'Kanban' };

const addressOf = (slug) => appUrl(`/${slug}`).replace(/^https?:\/\//, '');

/** The organization's logo when mail clients can load it, otherwise a coloured tile with its initials. */
function brandTile({ name, slug, logoUrl, initials, color }) {
  const size = 40;
  if (logoUrl && canLoadImages()) {
    return `<img src="${escapeHtml(appUrl(logoUrl))}" width="${size}" height="${size}" alt="${escapeHtml(name)}" style="display:block;border:1px solid #e4e4e7;border-radius:10px;background:#ffffff;object-fit:contain" />`;
  }
  const background = color ?? tileColor(slug ?? name);
  const text = initials ?? (String(name).trim().slice(0, 2).toUpperCase() || 'V');
  return `<table cellpadding="0" cellspacing="0" role="presentation"><tr><td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${background}" style="width:${size}px;height:${size}px;border-radius:10px;background:${background};color:#ffffff;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:0.5px">${escapeHtml(text)}</td></tr></table>`;
}

function detailsCard(rows) {
  if (!rows?.length) return '';
  const body = rows
    .map(
      ({ label, value, hint }, index) => `<tr>
        <td valign="top" style="padding:12px 16px;${index ? 'border-top:1px solid #ececf1;' : ''}width:120px;font-size:13px;color:#71717a">${escapeHtml(label)}</td>
        <td valign="top" style="padding:12px 16px;${index ? 'border-top:1px solid #ececf1;' : ''}font-size:14px;color:#18181b">
          <div style="font-weight:600">${value}</div>
          ${hint ? `<div style="margin-top:2px;font-size:12px;color:#71717a">${escapeHtml(hint)}</div>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px 0 4px;border:1px solid #e4e4e7;border-radius:12px;background:#fafafb;border-collapse:separate">${body}</table>`;
}

function actionButton(label, url) {
  if (!url) return '';
  return `<table cellpadding="0" cellspacing="0" role="presentation" style="margin:28px 0 0"><tr>
    <td bgcolor="${BRAND}" style="border-radius:10px;background:${BRAND}">
      <a href="${url}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px">${escapeHtml(label)} &rarr;</a>
    </td>
  </tr></table>
  <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#71717a">Button not working? Paste this link into your browser:<br /><a href="${url}" style="color:${BRAND};word-break:break-all">${escapeHtml(url)}</a></p>`;
}

/**
 * Shared email shell: a brand header (the organization when there is one), an optional eyebrow and details card,
 * one call to action and a footer. `intro`, `note` and detail values are trusted HTML; everything else is escaped.
 */
function renderLayout({ preheader, brand, eyebrow, heading, intro, details, actionLabel, actionUrl, note, footer }) {
  const header = brand ?? { name: 'Vector', logoUrl: '/pwa-64x64.png', initials: 'V', color: BRAND };
  const subtitle = brand?.slug ? addressOf(brand.slug) : brand ? 'on Vector' : 'Work management';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light" /><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:${FONT};color:#18181b;-webkit-font-smoothing:antialiased">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" bgcolor="#f4f4f7"><tr><td align="center" style="padding:40px 16px">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:560px">
      <tr><td style="padding:0 4px 18px">
        <table cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">${brandTile(header)}</td>
          <td valign="middle" style="padding-left:12px">
            <div style="font-size:16px;font-weight:700;color:#18181b;line-height:1.2">${escapeHtml(header.name)}</div>
            <div style="font-size:12px;color:#71717a;line-height:1.4">${escapeHtml(subtitle)}</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden">
        <div style="height:4px;background:${BRAND};background-image:linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899);font-size:0;line-height:0">&nbsp;</div>
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td style="padding:36px 36px 32px">
          ${eyebrow ? `<div style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND}">${escapeHtml(eyebrow)}</div>` : ''}
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:#18181b">${escapeHtml(heading)}</h1>
          <div style="font-size:15px;line-height:1.65;color:#3f3f46">${intro}</div>
          ${detailsCard(details)}
          ${actionButton(actionLabel, actionUrl)}
          ${note ? `<div style="margin:28px 0 0;padding:14px 16px;border-radius:10px;background:#eef2ff;font-size:13px;line-height:1.6;color:#3730a3">${note}</div>` : ''}
        </td></tr></table>
      </td></tr>
      <tr><td align="center" style="padding:22px 24px 0;font-size:12px;line-height:1.6;color:#a1a1aa">
        ${escapeHtml(footer ?? 'You received this email because of your activity in Vector.')}<br />
        Sent by <a href="${appUrl('/')}" style="color:#71717a;text-decoration:underline">Vector</a> &middot; work management for teams
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

const inviterLine = ({ inviterName, inviterEmail }) =>
  `${escapeHtml(inviterName)}${inviterEmail ? `<div style="margin-top:2px;font-size:12px;font-weight:400;color:#71717a">${escapeHtml(inviterEmail)}</div>` : ''}`;

const organizationLine = (organization) =>
  `${escapeHtml(organization.name)}${organization.slug ? `<div style="margin-top:2px;font-size:12px;font-weight:400;color:#71717a">${escapeHtml(addressOf(organization.slug))}</div>` : ''}`;

const projectLine = (project) =>
  `${escapeHtml(project.name)}${project.key ? ` <span style="font-weight:500;color:#71717a">&middot; ${escapeHtml(project.key)}${PROJECT_TYPES[project.type] ? ` &middot; ${PROJECT_TYPES[project.type]}` : ''}</span>` : ''}`;

const roleRow = (details, role) => {
  const entry = details[role] ?? details.member;
  return { label: 'Your role', value: escapeHtml(entry.label), hint: entry.description };
};

const invitationFooter = (email, inviterName) =>
  `This invitation was sent to ${email} by ${inviterName}. If you were not expecting it, you can safely ignore this email.`;

/** A new person invited to a project (and with it, the project's organization). */
export const inviteEmail = ({ inviterName, inviterEmail, organization, project, role = 'member', email, token }) => ({
  subject: `${inviterName} invited you to ${project.name} in ${organization.name}`,
  html: renderLayout({
    preheader: `Join ${project.name} and start working with the ${organization.name} team on Vector.`,
    brand: organization,
    eyebrow: 'You’re invited',
    heading: `Join ${project.name} at ${organization.name}`,
    intro: `<p style="margin:0"><strong>${escapeHtml(inviterName)}</strong> invited you to collaborate on the <strong>${escapeHtml(project.name)}</strong> project in the <strong>${escapeHtml(organization.name)}</strong> organization on Vector.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      { label: 'Project', value: projectLine(project) },
      roleRow(PROJECT_ROLE_DETAILS, role),
      { label: 'Invited by', value: inviterLine({ inviterName, inviterEmail }) },
    ],
    actionLabel: 'Accept invitation',
    actionUrl: appUrl(`/accept-invite?token=${token}`),
    note: `<strong>What happens next?</strong> Choose your name and a password, and you will land right in ${escapeHtml(organization.name)} with access to ${escapeHtml(project.name)}.`,
    footer: invitationFooter(email, inviterName),
  }),
});

/** A new person invited to an organization. */
export const organizationInviteEmail = ({ inviterName, inviterEmail, organization, role = 'member', email, token }) => ({
  subject: `${inviterName} invited you to join ${organization.name} on Vector`,
  html: renderLayout({
    preheader: `Accept to start working with the ${organization.name} team on Vector.`,
    brand: organization,
    eyebrow: 'You’re invited',
    heading: `Join ${organization.name} on Vector`,
    intro: `<p style="margin:0"><strong>${escapeHtml(inviterName)}</strong> invited you to the <strong>${escapeHtml(organization.name)}</strong> organization. Plan work, track tasks and collaborate with your team in one place.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      roleRow(ORGANIZATION_ROLE_DETAILS, role),
      { label: 'Invited by', value: inviterLine({ inviterName, inviterEmail }) },
    ],
    actionLabel: 'Accept invitation',
    actionUrl: appUrl(`/accept-invite?token=${token}`),
    note: `<strong>What happens next?</strong> Choose your name and a password, and you will land right in ${escapeHtml(organization.name)}.`,
    footer: invitationFooter(email, inviterName),
  }),
});

/** Someone who already has an account was added to an organization. */
export const addedToOrganizationEmail = ({ inviterName, inviterEmail, organization, role = 'member' }) => ({
  subject: `You were added to ${organization.name} on Vector`,
  html: renderLayout({
    preheader: `${inviterName} gave you access to ${organization.name}.`,
    brand: organization,
    eyebrow: 'New organization',
    heading: `You now have access to ${organization.name}`,
    intro: `<p style="margin:0"><strong>${escapeHtml(inviterName)}</strong> added you to the <strong>${escapeHtml(organization.name)}</strong> organization. You can switch to it any time from the organization menu in Vector.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      roleRow(ORGANIZATION_ROLE_DETAILS, role),
      { label: 'Added by', value: inviterLine({ inviterName, inviterEmail }) },
    ],
    actionLabel: `Open ${organization.name}`,
    actionUrl: appUrl(`/${organization.slug}`),
  }),
});

/** Someone who already has an account was added to a project. */
export const addedToProjectEmail = ({ inviterName, inviterEmail, organization, project, role = 'member' }) => ({
  subject: `You were added to ${project.name} in ${organization.name}`,
  html: renderLayout({
    preheader: `${inviterName} gave you access to ${project.name}.`,
    brand: organization,
    eyebrow: 'New project',
    heading: `You now have access to ${project.name}`,
    intro: `<p style="margin:0"><strong>${escapeHtml(inviterName)}</strong> added you to the <strong>${escapeHtml(project.name)}</strong> project in <strong>${escapeHtml(organization.name)}</strong>.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      { label: 'Project', value: projectLine(project) },
      roleRow(PROJECT_ROLE_DETAILS, role),
      { label: 'Added by', value: inviterLine({ inviterName, inviterEmail }) },
    ],
    actionLabel: 'Open project',
    actionUrl: appUrl(`/projects/${project.id}/board`),
  }),
});

/** To the super admin: a new organization is waiting for approval. */
export const organizationReviewRequestEmail = ({ organization, creator }) => ({
  subject: `New organization waiting for approval: ${organization.name}`,
  html: renderLayout({
    preheader: `${creator.name} created ${organization.name}. Approve it so the team can start using Vector.`,
    eyebrow: 'Approval needed',
    heading: `${organization.name} is waiting for approval`,
    intro: `<p style="margin:0"><strong>${escapeHtml(creator.name)}</strong> created a new organization. Nobody in it can use the portal until you approve it.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      { label: 'Created by', value: inviterLine({ inviterName: creator.name, inviterEmail: creator.email }) },
    ],
    actionLabel: 'Review organizations',
    actionUrl: appUrl('/super-admin'),
    footer: 'You received this email because you are the super admin of this Vector portal.',
  }),
});

/** To the organization's creator: the super admin approved it. */
export const organizationApprovedEmail = ({ organization, name }) => ({
  subject: `${organization.name} is approved — welcome to Vector`,
  html: renderLayout({
    preheader: `Your organization ${organization.name} is ready to use.`,
    brand: organization,
    eyebrow: 'Approved',
    heading: `${organization.name} is ready to use`,
    intro: `<p style="margin:0">Hi ${escapeHtml(name)}, good news: <strong>${escapeHtml(organization.name)}</strong> was approved. You can now create projects and invite your team.</p>`,
    details: [{ label: 'Organization', value: organizationLine(organization) }],
    actionLabel: `Open ${organization.name}`,
    actionUrl: appUrl(`/${organization.slug}`),
  }),
});

/** To the organization's creator: the super admin did not approve it. */
export const organizationRejectedEmail = ({ organization, name, reason }) => ({
  subject: `${organization.name} was not approved`,
  html: renderLayout({
    preheader: `Your organization ${organization.name} was not approved.`,
    brand: organization,
    eyebrow: 'Not approved',
    heading: `${organization.name} was not approved`,
    intro: `<p style="margin:0">Hi ${escapeHtml(name)}, the portal administrator did not approve <strong>${escapeHtml(organization.name)}</strong>, so it cannot be used for now.</p>`,
    details: [
      { label: 'Organization', value: organizationLine(organization) },
      ...(reason ? [{ label: 'Reason', value: escapeHtml(reason) }] : []),
    ],
    footer: 'If you think this is a mistake, reply to this email or contact the portal administrator.',
  }),
});

export const passwordResetEmail = ({ name, token }) => ({
  subject: 'Reset your Vector password',
  html: renderLayout({
    preheader: 'Use this link within 1 hour to choose a new password.',
    eyebrow: 'Account security',
    heading: 'Reset your password',
    intro: `<p style="margin:0">Hi ${escapeHtml(name)}, use the button below to choose a new password. The link expires in 1 hour.</p>`,
    actionLabel: 'Reset password',
    actionUrl: appUrl(`/reset-password?token=${token}`),
    footer: 'If you did not request this, you can safely ignore this email.',
  }),
});

export const notificationEmail = ({ title, body, link }) => ({
  subject: title,
  html: renderLayout({
    preheader: body,
    heading: title,
    intro: body ? `<p style="margin:0">${escapeHtml(body)}</p>` : '',
    actionLabel: 'View in Vector',
    actionUrl: link ? appUrl(link) : null,
    footer: 'Manage email notifications in Settings → Notifications.',
  }),
});

export const dailyDigestEmail = ({ name, sections }) => ({
  subject: 'Your Vector daily digest',
  html: renderLayout({
    preheader: 'Your work for today at a glance.',
    eyebrow: 'Daily digest',
    heading: `Good morning, ${name}`,
    intro: sections
      .filter((section) => section.issues.length)
      .map(
        (section) =>
          `<p style="margin:16px 0 6px;font-weight:600">${escapeHtml(section.title)}</p><ul style="padding-left:18px;margin:0">${section.issues
            .map((issue) => `<li><a href="${appUrl(`/issues/${issue.key}`)}" style="color:${BRAND}">${escapeHtml(issue.key)}</a> ${escapeHtml(issue.title)}</li>`)
            .join('')}</ul>`,
      )
      .join(''),
    actionLabel: 'Open my tasks',
    actionUrl: appUrl('/'),
    footer: 'Turn off the daily digest in Settings → Notifications.',
  }),
});
