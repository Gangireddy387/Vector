import { Op } from 'sequelize';
import {
  ConversationApproval,
  ConversationDoc,
  ConversationMessage,
  ConversationPoll,
  User,
} from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { loadConversation } from './messages.service.js';

const MAX_POLL_OPTIONS = 6;
const broadcast = (people, event, payload) => people.forEach((userId) => emitToUser(userId, event, payload));

/** Avoid a circular import with messages.service (decorate → attachCollab → reloadMessage). */
async function reloadMessage(messageId, viewerId) {
  const { reloadMessage: reload } = await import('./messages.service.js');
  return reload(messageId, viewerId);
}

function pollView(poll, viewerId) {
  const votes = poll.votes ?? {};
  const tallies = (poll.options ?? []).map((text, index) => ({
    text,
    votes: Object.values(votes).filter((choice) => choice === index).length,
  }));
  return {
    id: poll.id,
    messageId: poll.messageId,
    question: poll.question,
    options: tallies,
    total: Object.keys(votes).length,
    status: poll.status,
    createdById: poll.createdById,
    myVote: viewerId && votes[viewerId] !== undefined ? votes[viewerId] : null,
  };
}

function approvalView(approval, viewerId, peopleById = new Map()) {
  const responses = approval.responses ?? {};
  const list = Object.entries(responses).map(([userId, decision]) => ({
    userId,
    decision,
    user: peopleById.get(userId) ?? null,
  }));
  return {
    id: approval.id,
    messageId: approval.messageId,
    title: approval.title,
    status: approval.status,
    createdById: approval.createdById,
    responses: list,
    approved: list.filter((row) => row.decision === 'approved').length,
    rejected: list.filter((row) => row.decision === 'rejected').length,
    myDecision: viewerId && responses[viewerId] ? responses[viewerId] : null,
  };
}

/** Attaches poll / approval cards onto decorated messages for one viewer. */
export async function attachCollab(messages, viewerId = null) {
  const ids = messages.map((message) => message.id);
  if (!ids.length) return messages;
  const [polls, approvals] = await Promise.all([
    ConversationPoll.findAll({ where: { messageId: { [Op.in]: ids } } }),
    ConversationApproval.findAll({ where: { messageId: { [Op.in]: ids } } }),
  ]);
  const responderIds = [...new Set(approvals.flatMap((row) => Object.keys(row.responses ?? {})))];
  const responders = responderIds.length
    ? await User.findAll({ where: { id: { [Op.in]: responderIds } }, attributes: USER_SUMMARY_ATTRIBUTES })
    : [];
  const peopleById = new Map(responders.map((user) => [user.id, user.toJSON ? user.toJSON() : user]));
  const pollOf = new Map(polls.map((poll) => [poll.messageId, pollView(poll, viewerId)]));
  const approvalOf = new Map(approvals.map((row) => [row.messageId, approvalView(row, viewerId, peopleById)]));
  return messages.map((message) => ({
    ...message,
    poll: pollOf.get(message.id) ?? null,
    approval: approvalOf.get(message.id) ?? null,
  }));
}

export async function destroyCollabForMessage(messageId) {
  await Promise.all([
    ConversationPoll.destroy({ where: { messageId } }),
    ConversationApproval.destroy({ where: { messageId } }),
  ]);
}

function docView(doc) {
  return {
    id: doc.id,
    conversationId: doc.conversationId,
    title: doc.title,
    body: doc.body,
    createdById: doc.createdById,
    updatedById: doc.updatedById,
    createdBy: doc.createdBy ?? null,
    updatedBy: doc.updatedBy ?? null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

const docIncludes = [
  { model: User, as: 'createdBy', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'updatedBy', attributes: USER_SUMMARY_ATTRIBUTES },
];

export async function listDocs(viewer, conversationId) {
  const { conversation } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Docs are for team chats and channels');
  const docs = await ConversationDoc.findAll({
    where: { conversationId },
    include: docIncludes,
    order: [['updatedAt', 'DESC']],
  });
  return docs.map(docView);
}

export async function createDoc(viewer, conversationId, { title, body = '' }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Docs are for team chats and channels');
  const cleaned = String(title ?? '').trim();
  if (!cleaned) throw ApiError.badRequest('Give the doc a title');
  const created = await ConversationDoc.create({
    conversationId,
    title: cleaned.slice(0, 150),
    body: String(body ?? '').slice(0, 50_000),
    createdById: viewer.id,
    updatedById: viewer.id,
  });
  const doc = docView(await ConversationDoc.findByPk(created.id, { include: docIncludes }));
  broadcast(people, 'conversation:doc', { conversationId, doc, action: 'upsert' });
  return doc;
}

export async function updateDoc(viewer, conversationId, docId, { title, body }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Docs are for team chats and channels');
  const doc = await ConversationDoc.findOne({ where: { id: docId, conversationId } });
  if (!doc) throw ApiError.notFound('Doc not found');
  const changes = { updatedById: viewer.id };
  if (title !== undefined) {
    const cleaned = String(title).trim();
    if (!cleaned) throw ApiError.badRequest('Give the doc a title');
    changes.title = cleaned.slice(0, 150);
  }
  if (body !== undefined) changes.body = String(body).slice(0, 50_000);
  await doc.update(changes);
  const next = docView(await ConversationDoc.findByPk(doc.id, { include: docIncludes }));
  broadcast(people, 'conversation:doc', { conversationId, doc: next, action: 'upsert' });
  return next;
}

export async function deleteDoc(viewer, conversationId, docId) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Docs are for team chats and channels');
  const doc = await ConversationDoc.findOne({ where: { id: docId, conversationId } });
  if (!doc) throw ApiError.notFound('Doc not found');
  await doc.destroy();
  broadcast(people, 'conversation:doc', { conversationId, docId, action: 'remove' });
}

/** Posts a poll as a new channel post. */
export async function createPoll(viewer, conversationId, { question, options, subject = null }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Polls are for team chats and channels');
  const cleanedQuestion = String(question ?? '').trim();
  if (!cleanedQuestion) throw ApiError.badRequest('Ask a question');
  const cleanedOptions = [...new Set((options ?? []).map((item) => String(item).trim()).filter(Boolean))].slice(0, MAX_POLL_OPTIONS);
  if (cleanedOptions.length < 2) throw ApiError.badRequest('Add at least two options');
  const created = await ConversationMessage.create({
    conversationId,
    authorId: viewer.id,
    body: cleanedQuestion,
    subject: subject ? String(subject).trim().slice(0, 150) : 'Poll',
    important: false,
  });
  await ConversationPoll.create({
    conversationId,
    messageId: created.id,
    createdById: viewer.id,
    question: cleanedQuestion.slice(0, 200),
    options: cleanedOptions,
    votes: {},
    status: 'open',
  });
  const message = await reloadMessage(created.id, viewer.id);
  broadcast(people, 'conversation:message', message);
  return message;
}

export async function votePoll(viewer, conversationId, pollId, optionIndex) {
  const { people } = await loadConversation(viewer, conversationId);
  const poll = await ConversationPoll.findOne({ where: { id: pollId, conversationId } });
  if (!poll) throw ApiError.notFound('Poll not found');
  if (poll.status !== 'open') throw ApiError.badRequest('This poll is closed');
  if (!Number.isInteger(optionIndex) || optionIndex < 0 || optionIndex >= (poll.options?.length ?? 0)) {
    throw ApiError.badRequest('Pick one of the options');
  }
  const votes = { ...(poll.votes ?? {}), [viewer.id]: optionIndex };
  await poll.update({ votes });
  const message = await reloadMessage(poll.messageId, viewer.id);
  broadcast(people, 'conversation:updated', message);
  return message;
}

export async function closePoll(viewer, conversationId, pollId) {
  const { people } = await loadConversation(viewer, conversationId);
  const poll = await ConversationPoll.findOne({ where: { id: pollId, conversationId } });
  if (!poll) throw ApiError.notFound('Poll not found');
  if (poll.createdById !== viewer.id) throw ApiError.forbidden('Only the person who started the poll can close it');
  if (poll.status !== 'closed') await poll.update({ status: 'closed' });
  const message = await reloadMessage(poll.messageId, viewer.id);
  broadcast(people, 'conversation:updated', message);
  return message;
}

/** Posts an approval request as a new channel post. */
export async function createApproval(viewer, conversationId, { title, body = '' }) {
  const { conversation, people } = await loadConversation(viewer, conversationId);
  if (conversation.kind === 'direct') throw ApiError.badRequest('Approvals are for team chats and channels');
  const cleanedTitle = String(title ?? '').trim();
  if (!cleanedTitle) throw ApiError.badRequest('Give the approval a title');
  const cleanedBody = String(body ?? '').trim();
  const created = await ConversationMessage.create({
    conversationId,
    authorId: viewer.id,
    body: cleanedBody || `Please review: ${cleanedTitle}`,
    subject: cleanedTitle.slice(0, 150),
    important: true,
  });
  await ConversationApproval.create({
    conversationId,
    messageId: created.id,
    createdById: viewer.id,
    title: cleanedTitle.slice(0, 150),
    responses: {},
    status: 'pending',
  });
  const message = await reloadMessage(created.id, viewer.id);
  broadcast(people, 'conversation:message', message);
  return message;
}

export async function respondApproval(viewer, conversationId, approvalId, decision) {
  if (!['approved', 'rejected'].includes(decision)) throw ApiError.badRequest('Choose approved or rejected');
  const { people } = await loadConversation(viewer, conversationId);
  const approval = await ConversationApproval.findOne({ where: { id: approvalId, conversationId } });
  if (!approval) throw ApiError.notFound('Approval not found');
  if (approval.status !== 'pending') throw ApiError.badRequest('This approval is already finished');
  if (approval.createdById === viewer.id) throw ApiError.badRequest('You cannot approve your own request');
  const responses = { ...(approval.responses ?? {}), [viewer.id]: decision };
  const rejected = Object.values(responses).some((value) => value === 'rejected');
  const approved = Object.values(responses).filter((value) => value === 'approved').length;
  // Done when anyone rejects, or when at least one other person has approved (channel-style sign-off).
  const status = rejected ? 'rejected' : approved > 0 ? 'approved' : 'pending';
  await approval.update({ responses, status });
  const message = await reloadMessage(approval.messageId, viewer.id);
  broadcast(people, 'conversation:updated', message);
  return message;
}
