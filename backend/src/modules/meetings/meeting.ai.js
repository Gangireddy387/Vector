import crypto from 'node:crypto';
import { Meeting, MeetingChatMessage, MeetingQuestion, MeetingTranscriptLine } from '../../database/models.js';
import { completeJson, transcribeAudio } from '../ai/openai.client.js';
import { meetingAiAllowed } from './meeting.ai-access.js';
import { currentCall, mutate, roomChannel } from './meeting.signaling.js';

/**
 * AI during a call:
 * - Notes from speech: each browser sends short recordings of its own microphone (the host's browser also those of
 *   phone callers); they are turned into text here, shown as captions and kept as the transcript. Works in every
 *   browser and language, and knows exactly who spoke.
 * - Translated captions: each person chooses a language; finished lines are translated for them.
 * - The assistant: "catch me up" and questions about what was said so far, answered for the asker only.
 * - Q&A help: similar questions found and merged, answers drafted for the host.
 * Everything here needs the AI assistant (meeting.ai-access.js).
 */

export const CAPTION_LANGUAGES = {
  en: 'English',
  hi: 'Hindi',
  te: 'Telugu',
  ta: 'Tamil',
  kn: 'Kannada',
  ml: 'Malayalam',
  mr: 'Marathi',
  bn: 'Bengali',
  gu: 'Gujarati',
  ur: 'Urdu',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  ar: 'Arabic',
  zh: 'Chinese (Simplified)',
  ja: 'Japanese',
};

const AUDIO_MIN_BYTES = 1500;
const AUDIO_MAX_BYTES = 3 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|wav|x-m4a|aac)/i;
const AUDIO_BURST = { count: 40, windowMs: 60_000 };
const ASK_BURST = { count: 6, windowMs: 60_000 };
const CAPTION_BURST = { count: 30, windowMs: 10_000 };
const MATERIAL_CHARS = 40_000;

/** What speech-to-text models tend to "hear" in silence or noise. */
const PHANTOM = /^(thank you\.?|thanks\.?|thanks for watching[.!]?|please subscribe[.!]?|subtitles by .*|you\.?|bye\.?|\.+|…)$/i;

const fail = (ack, error) => ack?.({ ok: false, error });

function limiter() {
  const times = new Map();
  return (key, { count, windowMs }) => {
    const now = Date.now();
    const recent = (times.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= count) return false;
    times.set(key, [...recent, now]);
    return true;
  };
}

const clip = (text, size) => (text.length > size ? `[…]\n${text.slice(-size)}` : text);
const time = (date) => new Date(date).toISOString().slice(11, 16);

/** What has been said and written in the call so far (the end kept when it is long). */
export async function liveMaterial(meetingId, room = null) {
  const [meeting, transcript, chat, questions] = await Promise.all([
    Meeting.findByPk(meetingId, { attributes: ['title', 'agenda', 'notes'] }),
    MeetingTranscriptLine.findAll({ where: { meetingId }, order: [['spokenAt', 'ASC']], limit: 4000 }),
    MeetingChatMessage.findAll({ where: { meetingId, room }, order: [['createdAt', 'ASC']], limit: 500 }),
    MeetingQuestion.findAll({ where: { meetingId }, order: [['createdAt', 'ASC']], limit: 200 }),
  ]);
  if (!meeting) return { meeting: null, text: '', said: false };
  const sections = [
    `Meeting: ${meeting.title}`,
    meeting.agenda && `Agenda:\n${meeting.agenda}`,
    meeting.notes && `Host's notes:\n${meeting.notes}`,
    questions.length && `Questions asked (Q&A):\n${questions.map((item) => `- ${item.text}${item.answer ? ` → answered: ${item.answer}` : item.answeredAt ? ' (answered)' : ''}`).join('\n')}`,
    chat.length && `Chat:\n${chat.map((message) => `[${time(message.createdAt)}] ${message.author?.name ?? 'Someone'}: ${message.body}`).join('\n')}`,
    transcript.length && `Transcript:\n${transcript.map((line) => `[${time(line.spokenAt)}] ${line.speaker?.name ?? 'Someone'}: ${line.text}`).join('\n')}`,
  ].filter(Boolean);
  return { meeting, text: clip(sections.join('\n\n'), MATERIAL_CHARS), said: transcript.length + chat.length > 0 };
}

// --- Captions and translation ---------------------------------------------------------------------------------------

/** Translates one line into each language; `{ code: text }` (missing codes when it failed). */
export async function translateLine(text, languages) {
  const targets = languages.filter((code) => CAPTION_LANGUAGES[code]);
  if (!targets.length) return {};
  const answer = await completeJson({
    system: `You translate live meeting captions. Reply in JSON: {"translations": {"<code>": "<text>"}} with one entry per requested language code. Keep names, numbers and product terms. When the line already is in a language, return it unchanged for that code.`,
    user: `Languages: ${targets.map((code) => `${code} (${CAPTION_LANGUAGES[code]})`).join(', ')}\nLine: ${text}`,
    temperature: 0,
    timeoutMs: 15_000,
  });
  const translations = answer?.translations ?? {};
  return Object.fromEntries(targets.filter((code) => typeof translations[code] === 'string' && translations[code].trim()).map((code) => [code, translations[code].trim().slice(0, 600)]));
}

/** Shows a caption to the people in the speaker's room; finished lines go into the transcript and get translated. */
async function shareCaption(io, here, { id, socketId, speaker, text, final, at = new Date() }) {
  const channel = roomChannel(here.meetingId, here.peer.room);
  io.to(channel).emit('meeting:caption', { id, socketId, speaker, text, final });
  if (!final) return;
  await MeetingTranscriptLine.create({ meetingId: here.meetingId, speaker, text, spokenAt: at }).catch(() => undefined);
  const wanted = new Map();
  for (const peer of Object.values(here.call.peers)) {
    if (peer.room !== here.peer.room || !peer.captionLanguage) continue;
    wanted.set(peer.captionLanguage, [...(wanted.get(peer.captionLanguage) ?? []), peer.socketId]);
  }
  if (!wanted.size || !(await meetingAiAllowed(await organizationOf(here.meetingId)))) return;
  const translations = await translateLine(text, [...wanted.keys()]);
  for (const [language, sockets] of wanted) {
    if (translations[language]) io.to(sockets).emit('meeting:caption-translation', { id, language, text: translations[language] });
  }
}

const organizations = new Map();
async function organizationOf(meetingId) {
  if (organizations.size > 5000) organizations.clear();
  if (!organizations.has(meetingId)) organizations.set(meetingId, (await Meeting.findByPk(meetingId, { attributes: ['organizationId'] }))?.organizationId ?? null);
  return organizations.get(meetingId);
}

/** Names in the call and the meeting's title help the speech model spell them. */
const vocabulary = (here, title) => [title, ...Object.values(here.call.peers).map((peer) => peer.user.name)].filter(Boolean).join(', ');

// --- Q&A help -------------------------------------------------------------------------------------------------------

/** An open question that asks the same thing as `text`, or null. */
export async function findSimilarQuestion(text, open) {
  if (!open.length) return null;
  const answer = await completeJson({
    system: 'You compare audience questions. Reply in JSON: {"match": "<id>" | null}. Give the id of the existing question that asks essentially the same thing as the new one (same intent, even worded differently), otherwise null.',
    user: `New question: ${text}\nExisting questions:\n${open.map((item) => `${item.id}: ${item.text}`).join('\n')}`,
    temperature: 0,
    timeoutMs: 12_000,
  });
  return open.find((item) => item.id === answer?.match) ?? null;
}

/** Groups of open questions that ask the same thing (each group has 2 or more ids). */
export async function groupSimilarQuestions(open) {
  if (open.length < 2) return [];
  const answer = await completeJson({
    system: 'You group audience questions that ask essentially the same thing. Reply in JSON: {"groups": [["<id>", "<id>", ...], ...]}. Only include groups of two or more; leave out questions that are unique.',
    user: open.map((item) => `${item.id}: ${item.text}`).join('\n'),
    temperature: 0,
  });
  const known = new Set(open.map((item) => item.id));
  const used = new Set();
  return (Array.isArray(answer?.groups) ? answer.groups : [])
    .map((group) => (Array.isArray(group) ? group.filter((id) => known.has(id) && !used.has(id)) : []))
    .filter((group) => group.length > 1)
    .map((group) => {
      group.forEach((id) => used.add(id));
      return group;
    });
}

/** A short answer for the host to read out or publish, from what the meeting has so far. */
export async function draftAnswer(meetingId, question) {
  const { text } = await liveMaterial(meetingId);
  const answer = await completeJson({
    system: `You help the host of a work meeting answer an audience question. Reply in JSON: {"answer": string}. Write 1 to 4 sentences the host could say, using only the meeting material. When the material does not answer it, say so briefly and suggest who or what could answer it. Reply in the language of the question.`,
    user: `Question: ${question}\n\nMeeting material:\n${text}`,
  });
  return typeof answer?.answer === 'string' ? answer.answer.trim().slice(0, 2000) : null;
}

// --- Socket events --------------------------------------------------------------------------------------------------

export function registerMeetingAi(io, socket) {
  const allow = limiter();

  /** A piece of what someone said, from their browser's own speech recognition (when AI notes are not available). */
  socket.on('meeting:caption', async ({ id, text, final } = {}) => {
    const value = typeof text === 'string' ? text.trim().slice(0, 500) : '';
    if (!value || typeof id !== 'string' || id.length > 40 || !allow('caption', CAPTION_BURST)) return;
    const here = await currentCall(socket);
    if (!here?.call.transcribing) return;
    const speaker = { id: here.peer.user.id, name: here.peer.user.name, guest: here.peer.guest };
    await shareCaption(io, here, { id, socketId: socket.id, speaker, text: value, final: Boolean(final) });
  });

  /**
   * A short recording of this person's microphone (or, from someone running the call, of a phone caller: `phone` is
   * { identity, name }), while AI notes are on.
   */
  socket.on('meeting:audio', async ({ audio, mimeType, durationMs, phone } = {}, ack) => {
    if (!Buffer.isBuffer(audio) || audio.length < AUDIO_MIN_BYTES || audio.length > AUDIO_MAX_BYTES || !AUDIO_TYPES.test(String(mimeType))) return fail(ack, 'Not a recording');
    if (!allow('audio', AUDIO_BURST)) return fail(ack, 'Too many recordings');
    const here = await currentCall(socket);
    if (here?.call.transcribing?.mode !== 'ai') return fail(ack, 'AI notes are off');
    let speaker = { id: here.peer.user.id, name: here.peer.user.name, guest: here.peer.guest };
    if (phone) {
      if (!here.peer.canManage || typeof phone.identity !== 'string' || !phone.identity.startsWith('sip_')) return fail(ack, 'Not allowed');
      speaker = { id: phone.identity.slice(0, 80), name: String(phone.name ?? 'Phone caller').slice(0, 80), guest: true, phone: true };
    }
    const meeting = await Meeting.findByPk(here.meetingId, { attributes: ['title', 'organizationId'] });
    if (!(await meetingAiAllowed(meeting?.organizationId))) return fail(ack, 'AI notes are not available');
    const startedAt = new Date(Date.now() - Math.min(Math.max(Number(durationMs) || 0, 0), 60_000));
    const text = await transcribeAudio({ audio, mimeType: String(mimeType), prompt: vocabulary(here, meeting.title) });
    if (text === null) return fail(ack, 'Could not turn speech into text');
    const value = text.replace(/\s+/g, ' ').trim().slice(0, 1000);
    if (!value || PHANTOM.test(value)) return ack?.({ ok: true });
    // The call may have changed while the text was being made (moved rooms, notes turned off).
    const now = await currentCall(socket);
    if (now?.call.transcribing?.mode !== 'ai') return ack?.({ ok: true });
    await shareCaption(io, now, { id: `ai-${crypto.randomUUID().slice(0, 12)}`, socketId: phone ? phone.identity : socket.id, speaker, text: value, final: true, at: startedAt });
    ack?.({ ok: true });
  });

  /** The language this person reads captions in (null: as spoken). */
  socket.on('meeting:caption-language', async ({ language } = {}, ack) => {
    const value = language && CAPTION_LANGUAGES[language] ? language : null;
    const here = await currentCall(socket);
    if (!here) return fail(ack, 'You are not in the call');
    await mutate(here.meetingId, (call) => {
      if (call.peers[socket.id]) call.peers[socket.id].captionLanguage = value;
    });
    ack?.({ ok: true, language: value });
  });

  /** "Catch me up" (no question) or a question about the meeting so far, answered for this person only. */
  socket.on('meeting:ai:ask', async ({ question } = {}, ack) => {
    const here = await currentCall(socket);
    if (!here) return fail(ack, 'You are not in the call');
    const meeting = await Meeting.findByPk(here.meetingId, { attributes: ['organizationId'] });
    if (!(await meetingAiAllowed(meeting?.organizationId))) return fail(ack, 'The AI assistant is not available for your organization');
    if (!allow('ask', ASK_BURST)) return fail(ack, 'Wait a moment before asking again');
    const asked = typeof question === 'string' ? question.trim().slice(0, 500) : '';
    const material = await liveMaterial(here.meetingId, here.peer.room);
    if (!material.said) return fail(ack, 'Nothing has been said or written yet. Turn on AI notes so the assistant can follow the conversation.');
    const answer = await completeJson({
      system: `You are the meeting assistant inside a live video call. Answer only from the meeting material (agenda, notes, Q&A, chat and the transcript with [HH:MM] UTC times). Reply in JSON: {"answer": string}. Be brief and concrete: short paragraphs or "- " bullet points, at most about 150 words. Name who said what when it matters. If the material does not contain the answer, say so. ${asked ? 'Reply in the language of the question.' : 'Reply in the language most of the material is in.'}`,
      user: `${asked ? `Question: ${asked}` : 'Catch me up: what has been discussed so far, what was decided, open questions, and what is happening right now (the last few minutes).'}\n\nMeeting material:\n${material.text}`,
      timeoutMs: 45_000,
    });
    if (typeof answer?.answer !== 'string') return fail(ack, 'The assistant could not answer right now. Try again.');
    ack?.({ ok: true, answer: answer.answer.trim().slice(0, 4000) });
  });
}
