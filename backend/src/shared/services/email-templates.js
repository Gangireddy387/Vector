import { config } from '../../config/index.js';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export const appUrl = (path = '/') => `${config.clientUrl.split(',')[0].replace(/\/$/, '')}${path}`;

function renderLayout({ heading, intro, actionLabel, actionUrl, footer }) {
  const button = actionUrl
    ? `<p style="margin:28px 0"><a href="${actionUrl}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(actionLabel)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;padding:32px">
      <tr><td>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr>
          <td style="vertical-align:middle"><img src="${appUrl('/pwa-64x64.png')}" width="28" height="28" alt="" style="display:block;border:0" /></td>
          <td style="vertical-align:middle;padding-left:10px;font-size:16px;font-weight:700;color:#18181b">Vector</td>
        </tr></table>
        <h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(heading)}</h1>
        <div style="font-size:15px;line-height:1.6;color:#3f3f46">${intro}</div>
        ${button}
        <p style="font-size:12px;color:#a1a1aa;margin-top:32px">${escapeHtml(footer ?? 'You received this email because of your activity in Vector.')}</p>
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export const inviteEmail = ({ inviterName, projectName, token }) => ({
  subject: `${inviterName} invited you to ${projectName} on Vector`,
  html: renderLayout({
    heading: `Join ${projectName}`,
    intro: `<p>${escapeHtml(inviterName)} invited you to collaborate on <strong>${escapeHtml(projectName)}</strong>.</p>`,
    actionLabel: 'Accept invitation',
    actionUrl: appUrl(`/accept-invite?token=${token}`),
  }),
});

export const organizationInviteEmail = ({ inviterName, organizationName, token }) => ({
  subject: `${inviterName} invited you to ${organizationName} on Vector`,
  html: renderLayout({
    heading: `Join ${organizationName}`,
    intro: `<p>${escapeHtml(inviterName)} invited you to the <strong>${escapeHtml(organizationName)}</strong> organization on Vector.</p>`,
    actionLabel: 'Accept invitation',
    actionUrl: appUrl(`/accept-invite?token=${token}`),
  }),
});

export const addedToOrganizationEmail = ({ inviterName, organizationName, slug }) => ({
  subject: `You were added to ${organizationName} on Vector`,
  html: renderLayout({
    heading: `You now have access to ${organizationName}`,
    intro: `<p>${escapeHtml(inviterName)} added you to the organization. Switch to it from the organization menu in Vector.</p>`,
    actionLabel: `Open ${organizationName}`,
    actionUrl: appUrl(`/${slug}`),
  }),
});

export const addedToProjectEmail = ({ inviterName, projectName, projectId }) => ({
  subject: `You were added to ${projectName}`,
  html: renderLayout({
    heading: `You now have access to ${projectName}`,
    intro: `<p>${escapeHtml(inviterName)} added you to the project.</p>`,
    actionLabel: 'Open project',
    actionUrl: appUrl(`/projects/${projectId}/board`),
  }),
});

export const passwordResetEmail = ({ name, token }) => ({
  subject: 'Reset your Vector password',
  html: renderLayout({
    heading: 'Reset your password',
    intro: `<p>Hi ${escapeHtml(name)}, use the button below to choose a new password. The link expires in 1 hour.</p>`,
    actionLabel: 'Reset password',
    actionUrl: appUrl(`/reset-password?token=${token}`),
    footer: 'If you did not request this, you can safely ignore this email.',
  }),
});

export const notificationEmail = ({ title, body, link }) => ({
  subject: title,
  html: renderLayout({
    heading: title,
    intro: body ? `<p>${escapeHtml(body)}</p>` : '',
    actionLabel: 'View in Vector',
    actionUrl: link ? appUrl(link) : null,
    footer: 'Manage email notifications in Settings → Notifications.',
  }),
});

export const dailyDigestEmail = ({ name, sections }) => ({
  subject: 'Your Vector daily digest',
  html: renderLayout({
    heading: `Good morning, ${name}`,
    intro: sections
      .filter((section) => section.issues.length)
      .map(
        (section) =>
          `<p style="margin:16px 0 6px;font-weight:600">${escapeHtml(section.title)}</p><ul style="padding-left:18px;margin:0">${section.issues
            .map((issue) => `<li><a href="${appUrl(`/issues/${issue.key}`)}">${escapeHtml(issue.key)}</a> ${escapeHtml(issue.title)}</li>`)
            .join('')}</ul>`,
      )
      .join(''),
    actionLabel: 'Open my tasks',
    actionUrl: appUrl('/'),
    footer: 'Turn off the daily digest in Settings → Notifications.',
  }),
});
