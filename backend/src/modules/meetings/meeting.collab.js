import { Meeting, MeetingPoll, User } from '../../database/models.js';
import { shared } from '../../shared/realtime/shared-state.js';
import { currentCall, mutate, onCallEmptied } from './meeting.signaling.js';

/**
 * Polls and the shared whiteboard of a call. Both are kept with the meeting, so they can be read afterwards. While a
 * call runs, its whiteboard lives in the shared store (one entry per stroke) and is saved to the meeting regularly.
 */

const MAX_OPTIONS = 6;
const MAX_STROKES = 3000;
const MAX_STROKE_NUMBERS = 4000;
const SAVE_DELAY_MS = 3000;
const BOARD_TTL_SECONDS = 24 * 60 * 60;
const COLOR = /^#[0-9a-f]{6}$/i;

const voterOf = (peer) => peer.user.id;

export function pollView(poll, voter = null) {
  const json = typeof poll.toJSON === 'function' ? poll.toJSON() : poll;
  const votes = Object.values(json.votes ?? {});
  return {
    id: json.id,
    meetingId: json.meetingId,
    question: json.question,
    options: json.options.map((text, index) => ({ text, votes: votes.filter((choice) => choice === index).length })),
    total: votes.length,
    status: json.status,
    createdBy: json.createdBy ? { id: json.createdBy.id, name: json.createdBy.name } : null,
    createdById: json.createdById,
    createdAt: json.createdAt,
    myVote: voter && json.votes?.[voter] !== undefined ? json.votes[voter] : null,
  };
}

export async function meetingPolls(meetingId, voter = null) {
  const polls = await MeetingPoll.findAll({ where: { meetingId }, include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }], order: [['createdAt', 'ASC']] });
  return polls.map((poll) => pollView(poll, voter));
}

/** Work on one key runs one task after another in this process (votes on a poll, parts of one stroke). */
const queues = new Map();
function serial(key, task) {
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  queues.set(
    key,
    next.catch(() => undefined).finally(() => queues.get(key) === next && queues.delete(key)),
  );
  return next;
}

const strokesKey = (meetingId) => `board:${meetingId}`;
const loadedKey = (meetingId) => `board-loaded:${meetingId}`;

/** Puts the meeting's saved whiteboard in the shared store the first time the call uses it. */
function ensureBoard(meetingId) {
  return serial(`load:${meetingId}`, async () => {
    if (await shared.get(loadedKey(meetingId))) return;
    const meeting = await Meeting.findByPk(meetingId, { attributes: ['id', 'whiteboard'] });
    for (const stroke of meeting?.whiteboard?.strokes ?? []) await shared.hset(strokesKey(meetingId), stroke.id, stroke, BOARD_TTL_SECONDS);
    await shared.set(loadedKey(meetingId), true, BOARD_TTL_SECONDS);
  });
}

async function boardStrokes(meetingId) {
  await ensureBoard(meetingId);
  return shared.hvalues(strokesKey(meetingId));
}

const saveTimers = new Map();

async function saveBoard(meetingId) {
  clearTimeout(saveTimers.get(meetingId));
  saveTimers.delete(meetingId);
  if (!(await shared.get(loadedKey(meetingId)))) return;
  const strokes = await shared.hvalues(strokesKey(meetingId));
  await Meeting.update({ whiteboard: strokes.length ? { strokes } : null }, { where: { id: meetingId } }).catch((error) =>
    console.warn('[meetings] could not save the whiteboard:', error.message),
  );
}

function scheduleSave(meetingId) {
  clearTimeout(saveTimers.get(meetingId));
  const timer = setTimeout(() => void saveBoard(meetingId), SAVE_DELAY_MS);
  timer.unref?.();
  saveTimers.set(meetingId, timer);
}

onCallEmptied((meetingId) => {
  void saveBoard(meetingId).finally(() => shared.del(strokesKey(meetingId), loadedKey(meetingId)));
});

const cleanPoints = (points) =>
  Array.isArray(points) && points.length % 2 === 0 && points.length <= 400 && points.every((value) => typeof value === 'number' && value >= -0.05 && value <= 1.05)
    ? points.map((value) => Math.round(value * 10_000) / 10_000)
    : null;

export function registerMeetingCollab(io, socket) {
  const room = (meetingId) => `meeting:${meetingId}`;

  /** What a person joining the call needs: the polls (with their own votes) and the whiteboard. */
  socket.on('meeting:collab', async (_payload, ack) => {
    const here = await currentCall(socket);
    if (!here) return ack?.({ ok: false });
    ack?.({ ok: true, polls: await meetingPolls(here.meetingId, voterOf(here.peer)), board: { open: here.call.boardOpen, strokes: await boardStrokes(here.meetingId) } });
  });

  socket.on('meeting:poll:create', async ({ question, options } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here || here.peer.guest) return ack?.({ ok: false, error: 'Only people from the organization can start a poll' });
    const text = typeof question === 'string' ? question.trim().slice(0, 200) : '';
    const answers = (Array.isArray(options) ? options : []).map((option) => (typeof option === 'string' ? option.trim().slice(0, 80) : '')).filter(Boolean);
    if (!text) return ack?.({ ok: false, error: 'Write the question' });
    if (answers.length < 2 || answers.length > MAX_OPTIONS) return ack?.({ ok: false, error: `Give between 2 and ${MAX_OPTIONS} answers` });
    const poll = await MeetingPoll.create({ meetingId: here.meetingId, createdById: here.peer.user.id, question: text, options: answers, votes: {} });
    const view = pollView({ ...poll.toJSON(), createdBy: { id: here.peer.user.id, name: here.peer.user.name } });
    io.to(room(here.meetingId)).emit('meeting:poll', view);
    ack?.({ ok: true, poll: view });
  });

  socket.on('meeting:poll:vote', async ({ pollId, option } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here) return ack?.({ ok: false });
    try {
      const view = await serial(`poll:${pollId}`, async () => {
        const poll = await MeetingPoll.findOne({ where: { id: pollId, meetingId: here.meetingId }, include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }] });
        if (!poll) throw new Error('This poll was removed');
        if (poll.status !== 'open') throw new Error('This poll is closed');
        if (!Number.isInteger(option) || option < 0 || option >= poll.options.length) throw new Error('Choose one of the answers');
        poll.votes = { ...poll.votes, [voterOf(here.peer)]: option };
        poll.changed('votes', true);
        await poll.save();
        return pollView(poll);
      });
      io.to(room(here.meetingId)).emit('meeting:poll', { ...view, myVote: null });
      ack?.({ ok: true, poll: { ...view, myVote: option } });
    } catch (error) {
      ack?.({ ok: false, error: error.message });
    }
  });

  socket.on('meeting:poll:close', async ({ pollId } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here) return ack?.({ ok: false });
    const poll = await MeetingPoll.findOne({ where: { id: pollId, meetingId: here.meetingId }, include: [{ model: User, as: 'createdBy', attributes: ['id', 'name'] }] });
    if (!poll) return ack?.({ ok: false, error: 'This poll was removed' });
    if (poll.createdById !== here.peer.user.id && !here.peer.canManage) return ack?.({ ok: false, error: 'Only who asked, or the host, can close this poll' });
    await poll.update({ status: 'closed' });
    io.to(room(here.meetingId)).emit('meeting:poll', { ...pollView(poll), myVote: null });
    ack?.({ ok: true });
  });

  /** Part of a stroke while someone draws: `points` are new [x, y, x, y…] between 0 and 1. */
  socket.on('meeting:wb:stroke', async ({ id, color, width, tool, points } = {}) => {
    const cleaned = cleanPoints(points);
    if (typeof id !== 'string' || id.length > 40 || !cleaned) return;
    const here = await currentCall(socket);
    if (!here) return;
    const { meetingId } = here;
    const owner = here.peer.user.id;
    const stroke = await serial(`stroke:${meetingId}:${id}`, async () => {
      await ensureBoard(meetingId);
      const existing = await shared.hget(strokesKey(meetingId), id);
      if (existing) {
        if (existing.owner !== owner || existing.points.length + cleaned.length > MAX_STROKE_NUMBERS) return null;
        existing.points.push(...cleaned);
        await shared.hset(strokesKey(meetingId), id, existing, BOARD_TTL_SECONDS);
        return existing;
      }
      if ((await shared.hcount(strokesKey(meetingId))) >= MAX_STROKES) return null;
      const created = {
        id,
        owner,
        color: COLOR.test(color) ? color : '#111827',
        width: Math.min(Math.max(Number(width) || 3, 1), 40),
        tool: tool === 'highlighter' ? 'highlighter' : 'pen',
        points: cleaned,
      };
      await shared.hset(strokesKey(meetingId), id, created, BOARD_TTL_SECONDS);
      return created;
    });
    if (!stroke) return;
    socket.to(room(meetingId)).emit('meeting:wb:stroke', { id, owner, color: stroke.color, width: stroke.width, tool: stroke.tool, points: cleaned });
    scheduleSave(meetingId);
  });

  /** Erases one stroke: your own, or anyone's for the host. */
  socket.on('meeting:wb:remove', async ({ id } = {}) => {
    const here = await currentCall(socket);
    if (!here || typeof id !== 'string') return;
    const stroke = await shared.hget(strokesKey(here.meetingId), id);
    if (!stroke || (stroke.owner !== here.peer.user.id && !here.peer.canManage)) return;
    await shared.hdel(strokesKey(here.meetingId), id);
    io.to(room(here.meetingId)).emit('meeting:wb:remove', { id });
    scheduleSave(here.meetingId);
  });

  socket.on('meeting:wb:clear', async () => {
    const here = await currentCall(socket);
    if (!here?.peer.canManage) return;
    await shared.del(strokesKey(here.meetingId));
    io.to(room(here.meetingId)).emit('meeting:wb:clear', { by: here.peer.user.name });
    scheduleSave(here.meetingId);
  });

  /** Shows (or hides) the whiteboard as the main view for everyone in the call; guests cannot. */
  socket.on('meeting:wb:open', async ({ open } = {}) => {
    const here = await currentCall(socket);
    if (!here || here.peer.guest) return;
    await mutate(here.meetingId, (call) => {
      call.boardOpen = Boolean(open);
    });
    io.to(room(here.meetingId)).emit('meeting:wb:open', { open: Boolean(open), by: here.peer.user.name });
  });
}

/** Saves a whiteboard that is still being drawn on, e.g. before the meeting it belongs to is shown or deleted. */
export const flushBoard = (meetingId) => saveBoard(meetingId);
export async function forgetBoard(meetingId) {
  clearTimeout(saveTimers.get(meetingId));
  saveTimers.delete(meetingId);
  await shared.del(strokesKey(meetingId), loadedKey(meetingId));
}
