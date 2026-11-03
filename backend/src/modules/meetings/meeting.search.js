import { Op, fn, col, where as whereOf } from 'sequelize';
import { Meeting, MeetingChatMessage, MeetingParticipant, MeetingSearchChunk, MeetingTranscriptLine } from '../../database/models.js';
import { embedTexts } from '../ai/openai.client.js';
import { meetingAiAllowed } from './meeting.ai-access.js';

/**
 * Searching what was said and written in meetings ("when did we talk about pricing?"). Each meeting is cut into
 * pieces (stretches of the transcript and chat, the summary, notes, agenda). With the AI assistant every piece also
 * gets an embedding, so search finds the meaning and not only the words; without it, it matches words.
 * People only ever search meetings they may open: their own and those they were invited to (admins: all).
 */

const CHUNK_CHARS = 700;
const CHUNK_LINES = 12;
const EMBED_BATCH = 96;
const MAX_CANDIDATES = 6000;

function chunkLines(lines, kind) {
  const chunks = [];
  let current = null;
  for (const line of lines) {
    if (!current || current.lines >= CHUNK_LINES || current.text.length + line.text.length > CHUNK_CHARS) {
      current = { kind, at: line.at, text: '', lines: 0 };
      chunks.push(current);
    }
    current.text += `${current.text ? '\n' : ''}${line.text}`;
    current.lines += 1;
  }
  return chunks.map(({ kind: chunkKind, at, text }) => ({ kind: chunkKind, at, text }));
}

/** (Re)builds a meeting's search pieces; returns how many there are. */
export async function indexMeeting(meetingId) {
  const meeting = await Meeting.findByPk(meetingId);
  if (!meeting) return 0;
  const [transcript, chat] = await Promise.all([
    MeetingTranscriptLine.findAll({ where: { meetingId }, order: [['spokenAt', 'ASC']], limit: 8000 }),
    MeetingChatMessage.findAll({ where: { meetingId }, order: [['createdAt', 'ASC']], limit: 2000 }),
  ]);
  const summary = meeting.summary;
  const pieces = [
    ...chunkLines(transcript.map((line) => ({ at: line.spokenAt, text: `${line.speaker?.name ?? 'Someone'}: ${line.text}` })), 'transcript'),
    ...chunkLines(chat.filter((message) => message.body).map((message) => ({ at: message.createdAt, text: `${message.author?.name ?? 'Someone'}: ${message.body}` })), 'chat'),
    summary?.text && {
      kind: 'summary',
      at: null,
      text: [summary.text, ...(summary.decisions ?? []).map((item) => `Decision: ${item}`), ...(summary.actionItems ?? []).map((item) => `Action: ${item.text}${item.owner ? ` (${item.owner})` : ''}`)].join('\n'),
    },
    meeting.notes && { kind: 'notes', at: null, text: meeting.notes.slice(0, 4000) },
    meeting.agenda && { kind: 'agenda', at: null, text: meeting.agenda.slice(0, 4000) },
  ].filter(Boolean);

  let embeddings = [];
  if (pieces.length && (await meetingAiAllowed(meeting.organizationId))) {
    for (let start = 0; start < pieces.length; start += EMBED_BATCH) {
      const batch = await embedTexts(pieces.slice(start, start + EMBED_BATCH).map((piece) => `${meeting.title}\n${piece.text}`));
      if (!batch) {
        embeddings = [];
        break;
      }
      embeddings.push(...batch);
    }
  }

  await MeetingSearchChunk.destroy({ where: { meetingId } });
  if (pieces.length) {
    await MeetingSearchChunk.bulkCreate(
      pieces.map((piece, index) => ({ organizationId: meeting.organizationId, meetingId, ...piece, embedding: embeddings[index] ?? null })),
    );
  }
  return pieces.length;
}

export const indexInBackground = (meetingId) => void indexMeeting(meetingId).catch((error) => console.warn('[meetings] could not index a meeting for search:', error.message));

/** Meetings this person may search in. null: all of the organization's (admins). */
async function searchableMeetingIds(viewer) {
  if (viewer.isAdmin) return null;
  const [hosted, invited] = await Promise.all([
    Meeting.findAll({ where: { organizationId: viewer.organization.id, hostId: viewer.id }, attributes: ['id'], raw: true }),
    MeetingParticipant.findAll({ where: { userId: viewer.id }, attributes: ['meetingId'], raw: true }),
  ]);
  return [...new Set([...hosted.map((row) => row.id), ...invited.map((row) => row.meetingId)])];
}

function cosine(a, b) {
  let dot = 0;
  let left = 0;
  let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    left += a[index] * a[index];
    right += b[index] * b[index];
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

/** Words to match (LIKE wildcards removed: they mean nothing to the person searching). */
const termsOf = (query) =>
  [
    ...new Set(
      query
        .toLowerCase()
        .replace(/[%_\\]/g, ' ')
        .split(/\s+/)
        .filter((term) => term.length > 1),
    ),
  ].slice(0, 8);

/** The part of a piece worth showing: lines with the words searched for, else its start. */
function snippetOf(text, terms) {
  const lines = text.split('\n');
  const hits = lines.filter((line) => terms.some((term) => line.toLowerCase().includes(term)));
  return (hits.length ? hits.slice(0, 3) : lines.slice(0, 3)).join('\n').slice(0, 400);
}

/**
 * Finds what was said or written about `query`: `[{ meeting, kind, text, at, score }]`, best first (a few per
 * meeting). `mode` says how it searched: 'meaning' or 'words'.
 */
export async function searchMeetings(viewer, query) {
  const text = query.trim().slice(0, 300);
  const terms = termsOf(text);
  if (!text) return { mode: 'words', results: [] };
  const allowed = await searchableMeetingIds(viewer);
  if (allowed && !allowed.length) return { mode: 'words', results: [] };
  const scope = { organizationId: viewer.organization.id, ...(allowed ? { meetingId: allowed } : {}) };

  let scored = [];
  let mode = 'words';
  const useMeaning = await meetingAiAllowed(viewer.organization.id);
  const queryVector = useMeaning ? (await embedTexts([text]))?.[0] : null;
  if (queryVector) {
    const candidates = await MeetingSearchChunk.findAll({
      where: { ...scope, embedding: { [Op.ne]: null } },
      attributes: ['id', 'meetingId', 'kind', 'text', 'at', 'embedding'],
      order: [['createdAt', 'DESC']],
      limit: MAX_CANDIDATES,
    });
    if (candidates.length) {
      mode = 'meaning';
      scored = candidates
        .map((chunk) => {
          const lower = chunk.text.toLowerCase();
          const wordBonus = terms.length && terms.every((term) => lower.includes(term)) ? 0.08 : 0;
          return { chunk, score: cosine(queryVector, chunk.embedding) + wordBonus };
        })
        .filter((item) => item.score > 0.25);
    }
  }
  if (mode === 'words') {
    if (!terms.length) return { mode, results: [] };
    const matches = await MeetingSearchChunk.findAll({
      where: { [Op.and]: [scope, ...terms.map((term) => whereOf(fn('lower', col('text')), { [Op.like]: `%${term}%` }))] },
      attributes: ['id', 'meetingId', 'kind', 'text', 'at'],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    scored = matches.map((chunk) => ({ chunk, score: 1 }));
  }

  scored.sort((a, b) => b.score - a.score);
  const perMeeting = new Map();
  const picked = [];
  for (const item of scored) {
    const count = perMeeting.get(item.chunk.meetingId) ?? 0;
    if (count >= 3) continue;
    perMeeting.set(item.chunk.meetingId, count + 1);
    picked.push(item);
    if (picked.length >= 25) break;
  }
  const meetings = await Meeting.findAll({ where: { id: [...perMeeting.keys()] }, attributes: ['id', 'title', 'startsAt', 'startedAt', 'status'] });
  const byId = new Map(meetings.map((meeting) => [meeting.id, meeting]));
  return {
    mode,
    results: picked
      .filter((item) => byId.has(item.chunk.meetingId))
      .map(({ chunk, score }) => {
        const meeting = byId.get(chunk.meetingId);
        return {
          meeting: { id: meeting.id, title: meeting.title, startsAt: meeting.startedAt ?? meeting.startsAt, status: meeting.status },
          kind: chunk.kind,
          text: snippetOf(chunk.text, terms),
          at: chunk.at,
          score: Math.round(score * 1000) / 1000,
        };
      }),
  };
}

/** Deletes transcripts (and their search pieces) older than the organization keeps them (MEETING_TRANSCRIPT_DAYS). */
export async function purgeOldTranscripts(days) {
  if (!days) return 0;
  const before = new Date(Date.now() - days * 24 * 60 * 60_000);
  const removed = await MeetingTranscriptLine.destroy({ where: { spokenAt: { [Op.lt]: before } } });
  await MeetingSearchChunk.destroy({ where: { kind: 'transcript', at: { [Op.lt]: before } } });
  return removed;
}
