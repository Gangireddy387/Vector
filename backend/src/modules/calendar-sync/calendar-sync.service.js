import { Op } from 'sequelize';
import { config } from '../../config/index.js';
import { CalendarConnection, Meeting, MeetingCalendarLink, MeetingParticipant, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { logger } from '../../shared/logger.js';
import { emitToUser } from '../../shared/realtime/socket.js';
import { signOAuthState, TOKEN_TYPES, verifyAccessToken } from '../auth/token.js';
import { CALENDAR_PROVIDERS } from '../calendar/calendar-connection.model.js';
import { decrypt, encrypt } from './crypto.js';
import { CalendarAuthError, CalendarNotFoundError, PROVIDERS } from './providers.js';

/**
 * Two-way sync between meetings and their host's Google or Microsoft calendar. When the host has a calendar connected,
 * each meeting becomes an event there with the invited people as attendees: their calendar sends the invitations
 * (instead of the app's own emails) and their replies come back as RSVPs. Moving or cancelling the event in the
 * calendar moves or cancels the meeting; changes in the app go to the calendar.
 */

const REFRESH_EARLY_MS = 60_000;
const PULL_AHEAD_DAYS = 60;
const MIN_MINUTES = 15;
const MAX_MINUTES = 480;
const log = (message, fields) => logger.warn(`[calendar-sync] ${message}`, fields);

const providerOf = (id) => {
  const provider = CALENDAR_PROVIDERS.includes(id) ? PROVIDERS[id] : null;
  if (!provider) throw ApiError.notFound('Unknown calendar');
  return provider;
};

export const calendarSyncAvailable = () => Object.values(PROVIDERS).some((provider) => provider.configured());

const connectionView = (connection) =>
  connection ? { provider: connection.provider, accountEmail: connection.accountEmail, connectedAt: connection.createdAt, needsReconnect: Boolean(connection.brokenAt) } : null;

/** The calendars this server can connect, and which of them this person connected. */
export async function listConnections(userId) {
  const connections = await CalendarConnection.findAll({ where: { userId } });
  return Object.values(PROVIDERS).map((provider) => ({
    provider: provider.id,
    label: provider.label,
    available: provider.configured(),
    connection: connectionView(connections.find((connection) => connection.provider === provider.id)),
  }));
}

/** Where to send the person to allow access to their calendar. */
export function connectUrl(userId, providerId) {
  const provider = providerOf(providerId);
  if (!provider.configured()) throw ApiError.badRequest(`${provider.label} is not set up on this server`);
  return provider.authUrl(signOAuthState({ userId, provider: provider.id }));
}

const settingsPage = (result, provider) => `${config.clientUrl.split(',')[0].replace(/\/$/, '')}/settings?calendar=${result}&provider=${provider}#calendar`;

/** Back from the provider's sign-in page: keeps the (encrypted) sign-in and returns to settings. */
export async function completeOAuth(providerId, { code, state, error }) {
  const provider = providerOf(providerId);
  let payload;
  try {
    payload = verifyAccessToken(String(state ?? ''));
  } catch {
    return settingsPage('expired', provider.id);
  }
  if (payload.typ !== TOKEN_TYPES.oauth || payload.provider !== provider.id) return settingsPage('error', provider.id);
  if (error || !code) return settingsPage('denied', provider.id);
  try {
    const tokens = await provider.exchangeCode(String(code));
    const existing = await CalendarConnection.findOne({ where: { userId: payload.sub, provider: provider.id } });
    const values = {
      accountEmail: tokens.accountEmail,
      accessToken: encrypt(tokens.accessToken),
      // Providers only send a refresh token on the first consent; keep the one we have otherwise.
      refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : (existing?.refreshToken ?? null),
      expiresAt: tokens.expiresAt,
      brokenAt: null,
    };
    if (existing) await existing.update(values);
    else await CalendarConnection.create({ userId: payload.sub, provider: provider.id, ...values });
    emitToUser(payload.sub, 'calendar:connections', {});
    return settingsPage('connected', provider.id);
  } catch (exchangeError) {
    log('could not finish connecting a calendar', { provider: provider.id, error: exchangeError.message });
    return settingsPage('error', provider.id);
  }
}

export async function disconnect(userId, providerId) {
  const provider = providerOf(providerId);
  const connection = await CalendarConnection.findOne({ where: { userId, provider: provider.id } });
  if (!connection) return;
  // Events already sent stay on the calendars; the meetings just stop following them.
  await MeetingCalendarLink.destroy({ where: { connectionId: connection.id } });
  await connection.destroy();
}

/** A working access token for the connection (refreshed when it is about to expire). */
async function accessFor(connection) {
  if (connection.brokenAt) throw new CalendarAuthError('The calendar has to be connected again');
  if (connection.expiresAt && new Date(connection.expiresAt).getTime() - REFRESH_EARLY_MS > Date.now()) return decrypt(connection.accessToken);
  const refreshToken = decrypt(connection.refreshToken);
  if (!refreshToken) return decrypt(connection.accessToken);
  try {
    const tokens = await PROVIDERS[connection.provider].refresh(refreshToken);
    await connection.update({
      accessToken: encrypt(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshToken: encrypt(tokens.refreshToken) } : {}),
      expiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof CalendarAuthError) await markBroken(connection);
    throw error;
  }
}

async function markBroken(connection) {
  if (connection.brokenAt) return;
  await connection.update({ brokenAt: new Date() });
  emitToUser(connection.userId, 'calendar:connections', {});
}

/** With an expired or revoked sign-in, try once more after refreshing; a refused refresh marks the connection broken. */
async function withAccess(connection, action) {
  try {
    return await action(await accessFor(connection));
  } catch (error) {
    if (!(error instanceof CalendarAuthError) || connection.brokenAt) throw error;
    await connection.update({ expiresAt: new Date(0) });
    try {
      return await action(await accessFor(connection));
    } catch (retryError) {
      if (retryError instanceof CalendarAuthError) await markBroken(connection);
      throw retryError;
    }
  }
}

/** The host's working calendar connection (the first connected, Google before Microsoft). */
async function hostConnection(hostId) {
  if (!hostId || !calendarSyncAvailable()) return null;
  const connections = await CalendarConnection.findAll({ where: { userId: hostId, brokenAt: null } });
  return connections.find((connection) => PROVIDERS[connection.provider]?.configured()) ?? null;
}

/** True when the host's calendar sends this meeting's invitations (so the app does not email them as well). */
export async function calendarSendsInvites(meeting) {
  return Boolean(await hostConnection(meeting.hostId));
}

const meetingUrl = (meetingId) => `${config.clientUrl.split(',')[0].replace(/\/$/, '')}/meetings/${meetingId}`;

async function eventFor(meeting, dialIn) {
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }] });
  const link = meetingUrl(meeting.id);
  const lines = [meeting.agenda?.trim(), `Join the meeting: ${link}`, dialIn ? `Join by phone: ${dialIn.number} (PIN ${dialIn.pin}#)` : null].filter(Boolean);
  return {
    title: meeting.title,
    description: lines.join('\n\n'),
    location: link,
    start: new Date(meeting.startsAt),
    end: new Date(new Date(meeting.startsAt).getTime() + meeting.durationMinutes * 60_000),
    attendees: participants.filter((participant) => participant.user?.email).map((participant) => ({ email: participant.user.email, name: participant.user.name })),
  };
}

/**
 * Puts the meeting (as it is now) on its host's calendar, or takes it off when it was cancelled. Never throws: the
 * meeting itself is already saved; calendar problems are logged (and a refused sign-in asks the host to reconnect).
 */
export async function pushMeeting(meetingId, { dialIn = null } = {}) {
  try {
    const meeting = await Meeting.findByPk(meetingId);
    if (!meeting) return;
    const link = await MeetingCalendarLink.findOne({ where: { meetingId } });
    const connection = link ? await CalendarConnection.findByPk(link.connectionId) : await hostConnection(meeting.hostId);
    if (!connection || connection.brokenAt) return;
    const provider = PROVIDERS[connection.provider];
    if (!provider?.configured()) return;

    if (meeting.status === 'cancelled') {
      if (!link) return;
      await withAccess(connection, (token) => provider.cancelEvent(token, link.externalId)).catch((error) => {
        if (!(error instanceof CalendarNotFoundError)) throw error;
      });
      await link.destroy();
      return;
    }
    if (meeting.status === 'ended' && !link) return;

    const event = await eventFor(meeting, dialIn);
    let saved;
    try {
      saved = await withAccess(connection, (token) => provider.saveEvent(token, link?.externalId ?? null, event));
    } catch (error) {
      // Deleted in the calendar meanwhile: start a new event.
      if (!(error instanceof CalendarNotFoundError) || !link) throw error;
      saved = await withAccess(connection, (token) => provider.saveEvent(token, null, event));
    }
    const values = { connectionId: connection.id, provider: connection.provider, externalId: saved.id, syncedStart: event.start, syncedEnd: event.end, lastSyncedAt: new Date() };
    if (link) await link.update(values);
    else await MeetingCalendarLink.create({ meetingId, ...values });
  } catch (error) {
    log('could not update the calendar event', { meetingId, error: error.message });
  }
}

/** Runs `pushMeeting` after the response (saving a meeting never waits on a calendar). */
export const pushMeetingLater = (meetingId, options) => void pushMeeting(meetingId, options);

/**
 * Background job: what changed in the calendars since the last look. The calendar's time moves the meeting; a
 * cancelled or deleted event cancels it; the attendees' replies become RSVPs.
 * `actions`: { reschedule(meeting, { startsAt, durationMinutes }), cancel(meeting) } from the meetings module.
 */
export async function pullCalendarChanges(actions) {
  if (!calendarSyncAvailable()) return { checked: 0, changed: 0 };
  const now = Date.now();
  const links = await MeetingCalendarLink.findAll({
    include: [
      {
        model: Meeting,
        as: 'meeting',
        required: true,
        where: { status: 'scheduled', startsAt: { [Op.between]: [new Date(now - 8 * 60 * 60_000), new Date(now + PULL_AHEAD_DAYS * 24 * 60 * 60_000)] } },
      },
    ],
    limit: 500,
  });
  let changed = 0;
  for (const link of links) {
    try {
      if (await pullOne(link, actions)) changed += 1;
    } catch (error) {
      log('could not read a calendar event', { meetingId: link.meetingId, error: error.message });
    }
  }
  return { checked: links.length, changed };
}

async function pullOne(link, actions) {
  const connection = await CalendarConnection.findByPk(link.connectionId);
  if (!connection || connection.brokenAt) return false;
  const provider = PROVIDERS[connection.provider];
  if (!provider?.configured()) return false;
  const meeting = link.meeting;

  let event;
  try {
    event = await withAccess(connection, (token) => provider.getEvent(token, link.externalId));
  } catch (error) {
    if (!(error instanceof CalendarNotFoundError)) throw error;
    event = { cancelled: true };
  }
  if (event.cancelled) {
    await link.destroy();
    await actions.cancel(meeting);
    return true;
  }

  let changed = false;
  const moved = event.start.getTime() !== new Date(link.syncedStart).getTime() || event.end.getTime() !== new Date(link.syncedEnd).getTime();
  if (moved && event.end > event.start && event.start.getTime() > Date.now() - 5 * 60_000) {
    const durationMinutes = Math.min(Math.max(Math.round((event.end - event.start) / 60_000), MIN_MINUTES), MAX_MINUTES);
    await actions.reschedule(meeting, { startsAt: event.start, durationMinutes });
    changed = true;
  }
  await link.update({ syncedStart: event.start, syncedEnd: event.end, lastSyncedAt: new Date() });

  if (await applyResponses(meeting, event.attendees)) changed = true;
  return changed;
}

/** Saves each invited person's reply from the calendar; tells the host when any changed. */
async function applyResponses(meeting, attendees) {
  const byEmail = new Map(attendees.filter((person) => person.email).map((person) => [person.email.toLowerCase(), person.response]));
  if (!byEmail.size) return false;
  const participants = await MeetingParticipant.findAll({ where: { meetingId: meeting.id }, include: [{ model: User, as: 'user', attributes: ['id', 'email'] }] });
  let changed = false;
  for (const participant of participants) {
    const email = participant.user?.email?.toLowerCase();
    if (!email || !byEmail.has(email)) continue;
    const response = byEmail.get(email);
    if (participant.response !== response) {
      await participant.update({ response });
      changed = true;
    }
  }
  if (changed) {
    const people = new Set([meeting.hostId, ...participants.map((participant) => participant.userId)].filter(Boolean));
    for (const userId of people) emitToUser(userId, 'meeting:changed', { id: meeting.id, status: meeting.status });
  }
  return changed;
}
