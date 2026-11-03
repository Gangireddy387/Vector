import { Meeting, MeetingQuestion } from '../../database/models.js';
import { isUuid } from '../../shared/utils/ids.js';
import { draftAnswer, findSimilarQuestion, groupSimilarQuestions } from './meeting.ai.js';
import { meetingAiAllowed } from './meeting.ai-access.js';
import { currentCall } from './meeting.signaling.js';

/**
 * Questions for the host during a call (town halls, all-hands): anyone in the call asks, everyone upvotes, the host or
 * a co-host marks them answered (with a written answer when they like). They are kept with the meeting and listed in
 * the recap. With the AI assistant, a question like one already asked is pointed out before it is posted, the host
 * can merge similar questions and get an answer drafted.
 */

const aiFor = async (meetingId) => meetingAiAllowed((await Meeting.findByPk(meetingId, { attributes: ['organizationId'] }))?.organizationId);

const MAX_QUESTIONS = 500;
const MAX_LENGTH = 500;
const ASK_BURST = { count: 3, windowMs: 30_000 };

export const questionView = (question) => {
  const json = typeof question.toJSON === 'function' ? question.toJSON() : question;
  return {
    id: json.id,
    author: json.author,
    text: json.text,
    voters: json.voters ?? [],
    votes: (json.voters ?? []).length,
    answeredAt: json.answeredAt ?? null,
    answer: json.answer ?? null,
    createdAt: json.createdAt,
  };
};

export async function meetingQuestions(meetingId) {
  const questions = await MeetingQuestion.findAll({ where: { meetingId }, order: [['createdAt', 'ASC']] });
  return questions.map(questionView);
}

/** Changes to one question run one after another in this process (votes from many people at once). */
const queues = new Map();
function serial(key, task) {
  const next = (queues.get(key) ?? Promise.resolve()).then(task, task);
  queues.set(
    key,
    next.catch(() => undefined).finally(() => queues.get(key) === next && queues.delete(key)),
  );
  return next;
}

export function registerMeetingQa(io, socket) {
  const room = (meetingId) => `meeting:${meetingId}`;
  const fail = (ack, error) => ack?.({ ok: false, error });

  const askedAt = [];
  const mayAsk = () => {
    const now = Date.now();
    while (askedAt.length && now - askedAt[0] > ASK_BURST.windowMs) askedAt.shift();
    if (askedAt.length >= ASK_BURST.count) return false;
    askedAt.push(now);
    return true;
  };

  const findQuestion = async (meetingId, questionId) => (isUuid(questionId) ? MeetingQuestion.findOne({ where: { id: questionId, meetingId } }) : null);

  socket.on('meeting:qa:list', async (_payload, ack) => {
    const here = await currentCall(socket);
    if (!here) return fail(ack, 'You are not in the call');
    ack?.({ ok: true, questions: await meetingQuestions(here.meetingId) });
  });

  /**
   * Posts a question. With the AI assistant, a question that asks the same as an open one is not posted at first:
   * the answer carries `similar` (the person can upvote that one instead, or ask again with `force`).
   */
  socket.on('meeting:qa:ask', async ({ text, force = false } = {}, ack) => {
    const here = await currentCall(socket);
    const body = typeof text === 'string' ? text.trim().slice(0, MAX_LENGTH) : '';
    if (!here) return fail(ack, 'You are not in the call');
    if (!body) return fail(ack, 'Write your question first');
    if (!mayAsk()) return fail(ack, 'You are asking too quickly. Wait a moment.');
    if ((await MeetingQuestion.count({ where: { meetingId: here.meetingId } })) >= MAX_QUESTIONS) return fail(ack, 'This meeting has too many questions');
    if (!force && (await aiFor(here.meetingId))) {
      const open = await MeetingQuestion.findAll({ where: { meetingId: here.meetingId, answeredAt: null }, order: [['createdAt', 'DESC']], limit: 60 });
      const similar = await findSimilarQuestion(body, open);
      if (similar) return ack?.({ ok: true, similar: questionView(similar) });
    }
    const { id, name, avatarUrl = null, avatarColor = null } = here.peer.user;
    const question = await MeetingQuestion.create({
      meetingId: here.meetingId,
      author: { id, name, avatarUrl, avatarColor, guest: Boolean(here.peer.guest) },
      text: body,
      voters: [],
    });
    const view = questionView(question);
    io.to(room(here.meetingId)).emit('meeting:qa', view);
    ack?.({ ok: true, question: view });
  });

  /** Adds your vote, or takes it back. You cannot vote for your own question. */
  socket.on('meeting:qa:upvote', async ({ questionId } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here) return fail(ack, 'You are not in the call');
    const voter = here.peer.user.id;
    try {
      const view = await serial(`qa:${questionId}`, async () => {
        const question = await findQuestion(here.meetingId, questionId);
        if (!question) throw new Error('This question was removed');
        if (question.author?.id === voter) throw new Error('You cannot vote for your own question');
        const voters = question.voters ?? [];
        question.voters = voters.includes(voter) ? voters.filter((id) => id !== voter) : [...voters, voter];
        question.changed('voters', true);
        await question.save();
        return questionView(question);
      });
      io.to(room(here.meetingId)).emit('meeting:qa', view);
      ack?.({ ok: true });
    } catch (error) {
      fail(ack, error.message);
    }
  });

  /** The host or a co-host marks a question answered (or open again), optionally with a written `answer`. */
  socket.on('meeting:qa:answer', async ({ questionId, answered = true, answer } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here?.peer.canManage) return fail(ack, 'Only the host or a co-host can do that');
    const question = await findQuestion(here.meetingId, questionId);
    if (!question) return fail(ack, 'This question was removed');
    const written = typeof answer === 'string' ? answer.trim().slice(0, 2000) : undefined;
    await question.update({ answeredAt: answered ? new Date() : null, ...(written !== undefined ? { answer: written || null } : {}) });
    io.to(room(here.meetingId)).emit('meeting:qa', questionView(question));
    ack?.({ ok: true });
  });

  /** An answer drafted by the AI assistant for the host (only they see it, and can edit it before publishing). */
  socket.on('meeting:qa:draft', async ({ questionId } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here?.peer.canManage) return fail(ack, 'Only the host or a co-host can do that');
    if (!(await aiFor(here.meetingId))) return fail(ack, 'The AI assistant is not available for your organization');
    const question = await findQuestion(here.meetingId, questionId);
    if (!question) return fail(ack, 'This question was removed');
    const draft = await draftAnswer(here.meetingId, question.text);
    if (!draft) return fail(ack, 'No answer could be drafted right now. Try again.');
    ack?.({ ok: true, draft });
  });

  /** The host merges open questions that ask the same thing: votes join the most-voted one, the others go. */
  socket.on('meeting:qa:merge', async (_payload, ack) => {
    const here = await currentCall(socket);
    if (!here?.peer.canManage) return fail(ack, 'Only the host or a co-host can do that');
    if (!(await aiFor(here.meetingId))) return fail(ack, 'The AI assistant is not available for your organization');
    const open = await MeetingQuestion.findAll({ where: { meetingId: here.meetingId, answeredAt: null }, order: [['createdAt', 'ASC']], limit: 150 });
    const groups = await groupSimilarQuestions(open);
    let merged = 0;
    for (const group of groups) {
      const members = group.map((id) => open.find((item) => item.id === id)).sort((a, b) => (b.voters?.length ?? 0) - (a.voters?.length ?? 0));
      const [keep, ...others] = members;
      await serial(`qa:${keep.id}`, async () => {
        const authors = new Set([keep.author?.id]);
        const voters = new Set(keep.voters ?? []);
        for (const other of others) {
          for (const voter of [other.author?.id, ...(other.voters ?? [])]) if (voter && !authors.has(voter)) voters.add(voter);
        }
        keep.voters = [...voters];
        keep.changed('voters', true);
        await keep.save();
      });
      for (const other of others) {
        await other.destroy();
        io.to(room(here.meetingId)).emit('meeting:qa:removed', { id: other.id });
      }
      io.to(room(here.meetingId)).emit('meeting:qa', questionView(keep));
      merged += others.length;
    }
    ack?.({ ok: true, merged });
  });

  /** Who asked, or the host, removes a question. */
  socket.on('meeting:qa:remove', async ({ questionId } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here) return fail(ack, 'You are not in the call');
    const question = await findQuestion(here.meetingId, questionId);
    if (!question) return fail(ack, 'This question was removed');
    if (question.author?.id !== here.peer.user.id && !here.peer.canManage) return fail(ack, 'Only who asked, or the host, can remove this question');
    await question.destroy();
    io.to(room(here.meetingId)).emit('meeting:qa:removed', { id: question.id });
    ack?.({ ok: true });
  });
}
