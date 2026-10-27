import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { Notification, Organization, OrganizationMember, SupportMessage, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { notifyUsers } from '../notifications/notification.service.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

const THREAD_LIMIT = 300;
/** Disappearing message timers either side can pick, in hours. */
export const DISAPPEAR_OPTIONS = [24, 168];
const include = [{ model: User, as: 'author', attributes: USER_SUMMARY_ATTRIBUTES }];
const notExpired = () => ({ [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }] });
/** Unread counts only consider real, visible messages from the other side. */
const unreadWhere = (organizationId, fromPortal) => ({ organizationId, fromPortal, kind: 'message', deletedAt: null, readAt: null, ...notExpired() });

async function loadOrganization(organizationId) {
  const organization = await Organization.findByPk(organizationId, { attributes: ['id', 'name', 'slug', 'supportDisappearHours'] });
  if (!organization) throw ApiError.notFound('Organization not found');
  return organization;
}

const superAdminIds = async () =>
  config.superAdmin.email ? (await User.findAll({ where: { email: config.superAdmin.email }, attributes: ['id'], raw: true })).map((user) => user.id) : [];

const organizationAdminIds = async (organizationId) =>
  (await OrganizationMember.findAll({ where: { organizationId, role: 'admin', status: 'active' }, attributes: ['userId'], raw: true })).map((row) => row.userId);

/** Everyone in the conversation: the super admin and the organization's admins. */
async function broadcast(organizationId, event, payload) {
  const [portalIds, adminIds] = await Promise.all([superAdminIds(), organizationAdminIds(organizationId)]);
  for (const userId of new Set([...portalIds, ...adminIds])) emitToUser(userId, event, payload);
  return adminIds;
}

const withAuthor = async (id) => (await SupportMessage.findByPk(id, { include })).toJSON();

/** The conversation, oldest first, its disappearing-message timer, and how many messages from the other side are unread. */
export async function getThread(organizationId, side) {
  const organization = await loadOrganization(organizationId);
  const messages = await SupportMessage.findAll({ where: { organizationId, ...notExpired() }, include, order: [['createdAt', 'DESC']], limit: THREAD_LIMIT });
  const unread = await SupportMessage.count({ where: unreadWhere(organizationId, side === 'organization') });
  return { messages: messages.reverse(), unread, disappearHours: organization.supportDisappearHours ?? null };
}

/** Sends a message and delivers it live to both sides; organization admins also get an Inbox notification. */
export async function sendMessage(organizationId, author, side, body) {
  const organization = await loadOrganization(organizationId);
  const fromPortal = side === 'portal';
  const hours = organization.supportDisappearHours;
  const created = await SupportMessage.create({
    organizationId,
    authorId: author.id,
    fromPortal,
    body,
    expiresAt: hours ? new Date(Date.now() + hours * 3_600_000) : null,
  });
  const message = await withAuthor(created.id);
  const adminIds = await broadcast(organizationId, 'support:message', message);

  if (fromPortal) {
    await notifyUsers({
      userIds: adminIds,
      actorId: author.id,
      type: 'support_message',
      title: 'New message from the Vector team',
      body: body.slice(0, 200),
      link: supportLink(organization),
      email: false,
    });
  }
  return { message, organization: { id: organization.id, name: organization.name } };
}

/** "Delete for everyone": only the author can, and the bubble stays as "This message was deleted". */
export async function deleteMessage(organizationId, author, side, messageId) {
  const message = await SupportMessage.findOne({ where: { id: messageId, organizationId, kind: 'message' } });
  if (!message) throw ApiError.notFound('Message not found');
  if (message.authorId !== author.id || message.fromPortal !== (side === 'portal')) throw ApiError.forbidden('You can only delete your own messages');
  if (!message.deletedAt) await message.update({ body: '', deletedAt: new Date() });
  const updated = await withAuthor(message.id);
  await broadcast(organizationId, 'support:updated', updated);
  return updated;
}

const timerLabel = (hours) => (hours === 24 ? '24 hours' : `${hours / 24} days`);

/** Either side can turn disappearing messages on or off; a notice in the conversation says who did. */
export async function setDisappearing(organizationId, author, side, hours) {
  const organization = await loadOrganization(organizationId);
  if (hours !== null && !DISAPPEAR_OPTIONS.includes(hours)) throw ApiError.badRequest('Choose 24 hours, 7 days or off');
  if ((organization.supportDisappearHours ?? null) === hours) return getThread(organizationId, side);

  await organization.update({ supportDisappearHours: hours });
  const who = author.name;
  const body = hours
    ? `${who} turned on disappearing messages. New messages will disappear ${timerLabel(hours)} after they are sent.`
    : `${who} turned off disappearing messages.`;
  const notice = await SupportMessage.create({ organizationId, authorId: author.id, fromPortal: side === 'portal', kind: 'system', body, readAt: new Date() });
  await broadcast(organizationId, 'support:message', await withAuthor(notice.id));
  await broadcast(organizationId, 'support:settings', { organizationId, disappearHours: hours });
  return getThread(organizationId, side);
}

/**
 * Marks everything the other side wrote as read and tells the writers live (their ticks turn blue). An organization
 * admin opening the conversation also clears their "message from the Vector team" notifications.
 */
export async function markRead(organizationId, side, reader = null) {
  const readAt = new Date();
  const [updated] = await SupportMessage.update({ readAt }, { where: { organizationId, fromPortal: side === 'organization', readAt: null } });
  if (updated) {
    const writers = side === 'portal' ? await organizationAdminIds(organizationId) : await superAdminIds();
    for (const userId of writers) emitToUser(userId, 'support:read', { organizationId, readerSide: side, readAt });
  }
  if (side === 'organization' && reader) await clearSupportNotifications(await loadOrganization(organizationId), reader.id, readAt);
  return updated;
}

/** Opens this organization's conversation, switching to the organization first when needed. */
const supportLink = (organization) => `/${organization.slug}/admin/workspace?tab=support`;
/** Notifications sent before links named their organization. */
const LEGACY_SUPPORT_LINK = '/admin/workspace?tab=support';

async function clearSupportNotifications(organization, userId, readAt) {
  const where = { userId, type: 'support_message', readAt: null, link: [supportLink(organization), LEGACY_SUPPORT_LINK] };
  const ids = (await Notification.findAll({ where, attributes: ['id'], raw: true })).map((row) => row.id);
  if (!ids.length) return;
  await Notification.update({ readAt }, { where: { id: ids } });
  emitToUser(userId, 'notifications:read', { ids, readAt });
}

/** For the super admin: unread messages per organization. */
export async function unreadByOrganization() {
  const rows = await SupportMessage.findAll({
    where: { fromPortal: false, kind: 'message', deletedAt: null, readAt: null, ...notExpired() },
    attributes: ['organizationId', [SupportMessage.sequelize.fn('COUNT', SupportMessage.sequelize.col('id')), 'count']],
    group: ['organizationId'],
    raw: true,
  });
  return Object.fromEntries(rows.map((row) => [row.organizationId, Number(row.count)]));
}

/** Background job: removes disappearing messages whose time is up. Open chats drop them on their own. */
export async function purgeExpiredMessages() {
  return SupportMessage.destroy({ where: { expiresAt: { [Op.lte]: new Date() } } });
}
