import { Meeting, MeetingChatMessage, MeetingParticipant, MeetingTranscriptLine, MeetingUpdate, User } from '../../database/models.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { completeJson, isAiEnabled } from '../ai/openai.client.js';

/**
 * A written summary of a meeting (what was discussed, decisions, action items with owners), made by the AI assistant
 * from the transcript, the call's chat, the shared updates, the agenda and the host's notes.
 */

const MAX_SOURCE_CHARS = 60_000;
const SYSTEM = `You summarize work meetings for the people who attended and those who missed them.
Reply in JSON: {"text": string, "decisions": string[], "actionItems": [{"text": string, "owner": string | null}]}.
"text": 3 to 8 sentences of what was discussed, in plain language. "decisions": what was agreed. "actionItems": concrete
next steps; "owner" is the person's name when it is clear who takes it, otherwise null. Only use what the material says.
Write in the language most of the material is in. Leave lists empty when there is nothing for them.`;

const clip = (text, size) => (text.length > size ? `${text.slice(0, size)}\n[…]` : text);
const clean = (value, size) => (typeof value === 'string' ? value.trim().slice(0, size) : '');

/** What the assistant reads, most telling first; returns '' when there is nothing to summarize. */
async function material(meeting) {
  const [transcript, chat, updates] = await Promise.all([
    MeetingTranscriptLine.findAll({ where: { meetingId: meeting.id }, order: [['spokenAt', 'ASC']], limit: 5000 }),
    MeetingChatMessage.findAll({ where: { meetingId: meeting.id }, order: [['createdAt', 'ASC']], limit: 1000 }),
    MeetingUpdate.findAll({ where: { meetingId: meeting.id }, include: [{ model: User, as: 'author', attributes: ['name'] }], order: [['createdAt', 'ASC']] }),
  ]);
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

/** Writes (or rewrites) the summary; returns it, or null when there is nothing to summarize or no assistant. */
export async function summarizeMeeting(meetingId) {
  if (!isAiEnabled()) return null;
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) return null;
  const source = await material(meeting);
  if (!source) return null;
  const answer = await completeJson({ system: SYSTEM, user: source });
  if (!answer || typeof answer.text !== 'string') return null;
  const summary = {
    text: clean(answer.text, 4000),
    decisions: (Array.isArray(answer.decisions) ? answer.decisions : []).map((item) => clean(item, 400)).filter(Boolean).slice(0, 20),
    actionItems: (Array.isArray(answer.actionItems) ? answer.actionItems : [])
      .map((item) => ({ text: clean(item?.text, 400), owner: clean(item?.owner, 80) || null }))
      .filter((item) => item.text)
      .slice(0, 30),
    generatedAt: new Date().toISOString(),
  };
  await meeting.update({ summary });
  const participants = await MeetingParticipant.findAll({ where: { meetingId }, attributes: ['userId'], raw: true });
  for (const userId of new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean))) {
    emitToUser(userId, 'meeting:changed', { id: meeting.id, status: meeting.status });
  }
  return summary;
}

export const summarizeInBackground = (meetingId) =>
  void summarizeMeeting(meetingId).catch((error) => console.warn('[meetings] could not summarize a meeting:', error.message));

export { isAiEnabled as canSummarize };
