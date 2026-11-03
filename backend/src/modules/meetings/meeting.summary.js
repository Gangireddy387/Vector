import { Meeting, MeetingChatMessage, MeetingParticipant, MeetingTranscriptLine, MeetingUpdate, User } from '../../database/models.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { completeJson, isAiEnabled } from '../ai/openai.client.js';

/**
 * A written summary of a meeting (what was discussed, decisions, action items with owners and due dates, chapters
 * with their times), made by the AI assistant from the transcript, the call's chat, the shared updates, the agenda
 * and the host's notes. Action items already turned into tasks are kept when the summary is written again.
 */

const MAX_SOURCE_CHARS = 60_000;
const PRIORITIES = ['lowest', 'low', 'medium', 'high', 'highest'];
const systemPrompt = (day) => `You summarize work meetings for the people who attended and those who missed them.
Reply in JSON: {"text": string, "decisions": string[], "actionItems": [{"text": string, "owner": string | null, "due": "YYYY-MM-DD" | null, "priority": "low" | "medium" | "high" | null}]}.
"text": 3 to 8 sentences of what was discussed, in plain language. "decisions": what was agreed. "actionItems": concrete
next steps written as short task titles (start with a verb); "owner" is the person's name when it is clear who takes it,
otherwise null; "due" only when a date or deadline was said (the meeting was on ${day}; turn "by Friday" or "next week"
into a date); "priority" only when urgency was clear. Only use what the material says. Write in the language most of
the material is in. Leave lists empty when there is nothing for them.`;

const CHAPTERS_SYSTEM = `You split a meeting transcript into chapters, like chapters of a video. Reply in JSON:
{"chapters": [{"line": number, "title": string}]}: 3 to 10 chapters in order, "line" is the number of the line where the
topic starts (the first chapter starts at the first line), "title" is 2 to 6 words. Write titles in the transcript's language.`;

const clip = (text, size) => (text.length > size ? `${text.slice(0, size)}\n[…]` : text);
const clean = (value, size) => (typeof value === 'string' ? value.trim().slice(0, size) : '');
const isDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

async function sources(meeting) {
  const [transcript, chat, updates] = await Promise.all([
    MeetingTranscriptLine.findAll({ where: { meetingId: meeting.id }, order: [['spokenAt', 'ASC']], limit: 5000 }),
    MeetingChatMessage.findAll({ where: { meetingId: meeting.id }, order: [['createdAt', 'ASC']], limit: 1000 }),
    MeetingUpdate.findAll({ where: { meetingId: meeting.id }, include: [{ model: User, as: 'author', attributes: ['name'] }], order: [['createdAt', 'ASC']] }),
  ]);
  return { transcript, chat, updates };
}

/** What the assistant reads, most telling first; returns '' when there is nothing to summarize. */
function material(meeting, { transcript, chat, updates }) {
  if (!transcript.length && !chat.length && !updates.length && !meeting.notes) return '';
  const sections = [
    `Meeting: ${meeting.title}`,
    meeting.agenda && `Agenda:\n${meeting.agenda}`,
    transcript.length && `Transcript:\n${transcript.map((line) => `${line.speaker?.name ?? 'Someone'}: ${line.text}`).join('\n')}`,
    chat.length && `Chat:\n${chat.map((message) => `${message.author?.name ?? 'Someone'}: ${message.body}`).join('\n')}`,
    updates.length && `Updates shared:\n${updates.map((update) => `${update.author?.name ?? 'Someone'}: ${update.body}`).join('\n')}`,
    meeting.notes && `Host's notes:\n${meeting.notes}`,
  ].filter(Boolean);
  return clip(sections.join('\n\n'), MAX_SOURCE_CHARS);
}

/** The person an action item names: the full name, else a first name only one invited person has. */
export function matchOwner(name, people) {
  const wanted = clean(name, 80).toLowerCase();
  if (!wanted) return null;
  const exact = people.find((person) => person.name.toLowerCase() === wanted);
  if (exact) return exact.id;
  const first = wanted.split(/\s+/)[0];
  const byFirst = people.filter((person) => person.name.toLowerCase().split(/\s+/)[0] === first);
  return byFirst.length === 1 ? byFirst[0].id : null;
}

async function invitedPeople(meeting) {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, attributes: ['userId'], raw: true });
  const ids = [...new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean))];
  return User.findAll({ where: { id: ids }, attributes: ['id', 'name'], raw: true });
}

/** Chapters from the transcript: `[{ at, title }]` where `at` is when the topic started. */
async function writeChapters(transcript) {
  if (transcript.length < 12) return [];
  // Long calls: neighbouring lines are joined so the model sees the whole call.
  const step = Math.max(1, Math.ceil(transcript.length / 600));
  const blocks = [];
  for (let index = 0; index < transcript.length; index += step) {
    const lines = transcript.slice(index, index + step);
    blocks.push({ at: lines[0].spokenAt, text: lines.map((line) => `${line.speaker?.name ?? 'Someone'}: ${line.text}`).join(' ') });
  }
  const answer = await completeJson({ system: CHAPTERS_SYSTEM, user: clip(blocks.map((block, index) => `${index + 1}. ${block.text}`).join('\n'), MAX_SOURCE_CHARS), temperature: 0.2 });
  const seen = new Set();
  return (Array.isArray(answer?.chapters) ? answer.chapters : [])
    .map((chapter) => ({ index: Math.round(Number(chapter?.line)) - 1, title: clean(chapter?.title, 80) }))
    .filter((chapter) => chapter.title && chapter.index >= 0 && chapter.index < blocks.length && !seen.has(chapter.index) && seen.add(chapter.index))
    .sort((a, b) => a.index - b.index)
    .slice(0, 12)
    .map((chapter) => ({ at: new Date(blocks[chapter.index].at).toISOString(), title: chapter.title }));
}

/** Writes (or rewrites) the summary; returns it, or null when there is nothing to summarize or no assistant. */
export async function summarizeMeeting(meetingId) {
  if (!isAiEnabled()) return null;
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) return null;
  const found = await sources(meeting);
  const source = material(meeting, found);
  if (!source) return null;
  const day = new Date(meeting.startedAt ?? meeting.startsAt).toISOString().slice(0, 10);
  const [answer, chapters, people] = await Promise.all([
    completeJson({ system: systemPrompt(day), user: source, timeoutMs: 60_000 }),
    writeChapters(found.transcript),
    invitedPeople(meeting),
  ]);
  if (!answer || typeof answer.text !== 'string') return null;

  const created = (meeting.summary?.actionItems ?? []).filter((item) => item.issue);
  const fresh = (Array.isArray(answer.actionItems) ? answer.actionItems : [])
    .map((item) => {
      const owner = clean(item?.owner, 80) || null;
      return {
        text: clean(item?.text, 400),
        owner,
        ownerId: matchOwner(owner, people),
        due: isDate(item?.due) ? item.due : null,
        priority: PRIORITIES.includes(item?.priority) ? item.priority : null,
        issue: null,
      };
    })
    .filter((item) => item.text && !created.some((done) => done.text.toLowerCase() === item.text.toLowerCase()));

  const summary = {
    text: clean(answer.text, 4000),
    decisions: (Array.isArray(answer.decisions) ? answer.decisions : []).map((item) => clean(item, 400)).filter(Boolean).slice(0, 20),
    actionItems: [...created, ...fresh].slice(0, 40),
    chapters,
    generatedAt: new Date().toISOString(),
  };
  meeting.summary = summary;
  meeting.changed('summary', true);
  await meeting.save();
  notifyChanged(meeting, people.map((person) => person.id));
  return summary;
}

export function notifyChanged(meeting, userIds) {
  for (const userId of new Set(userIds)) emitToUser(userId, 'meeting:changed', { id: meeting.id, status: meeting.status });
}

export { isAiEnabled as canSummarize };
