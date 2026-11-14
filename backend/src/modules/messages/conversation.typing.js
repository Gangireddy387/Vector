import { Conversation, User } from '../../database/models.js';
import { isUuid } from '../../shared/utils/ids.js';
import { participantIds } from './membership.js';

/** Who may hear someone typing in a conversation is looked up again after this long (people join and leave teams). */
const AUDIENCE_TTL_MS = 60_000;

/**
 * "Ann is typing…": the browser sends `conversation:typing` every few seconds while someone writes; everyone else in
 * the conversation hears it. `parentId`: they are writing a reply to that post.
 */
export function registerConversationTyping(io, socket) {
  if (socket.data.guest) return;
  const audiences = new Map();
  let name = null;

  socket.on('conversation:typing', async (payload) => {
    const conversationId = payload?.conversationId;
    if (!isUuid(conversationId)) return;
    const { userId } = socket.data;
    let audience = audiences.get(conversationId);
    if (!audience || Date.now() - audience.at > AUDIENCE_TTL_MS) {
      const conversation = await Conversation.findByPk(conversationId, { attributes: ['id', 'kind', 'organizationId', 'teamId', 'departmentId', 'channelId'] });
      const people = conversation ? await participantIds(conversation) : [];
      audience = { people: people.includes(userId) ? people : [], at: Date.now() };
      audiences.set(conversationId, audience);
    }
    if (!audience.people.length) return;
    name ??= (await User.findByPk(userId, { attributes: ['name'] }))?.name ?? 'Someone';
    const event = { conversationId, userId, name, parentId: isUuid(payload.parentId) ? payload.parentId : null };
    for (const personId of audience.people) if (personId !== userId) io.to(`user:${personId}`).emit('conversation:typing', event);
  });
}
