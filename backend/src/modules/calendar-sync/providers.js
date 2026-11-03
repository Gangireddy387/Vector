import { config } from '../../config/index.js';

/**
 * Google Calendar (API v3) and Microsoft 365 / Outlook (Graph) over plain HTTPS. Each provider turns a meeting into an
 * event on the connected person's own calendar, with the invited people as attendees: the calendar sends them the
 * invitation and collects their replies, which come back through `getEvent`.
 *
 * Events: { title, description, location, start: Date, end: Date, attendees: [{ email, name }] }
 * Read back: { start: Date, end: Date, cancelled: boolean, attendees: [{ email, response: accepted|tentative|declined|null }] }
 */

const TIMEOUT_MS = 15_000;

export class CalendarAuthError extends Error {}
export class CalendarNotFoundError extends Error {}

export const redirectUri = (provider) => `${config.calendar.publicApiUrl}/api/calendar/oauth/${provider}/callback`;

async function call(url, { method = 'GET', token, json, form, headers = {} } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (response.status === 404 || response.status === 410) throw new CalendarNotFoundError('The calendar event is gone');
  if (response.status === 401 || (response.status === 400 && body?.error === 'invalid_grant')) throw new CalendarAuthError('The calendar sign-in is no longer valid');
  if (!response.ok) throw new Error(`Calendar request failed (${response.status}): ${body?.error?.message ?? body?.error_description ?? body?.error ?? 'unknown error'}`);
  return body;
}

const safeJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** The email in an ID token straight from the provider's token endpoint (over TLS, so its signature needs no check). */
const emailFromIdToken = (idToken) => {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return payload.email ?? payload.preferred_username ?? null;
  } catch {
    return null;
  }
};

const tokensFrom = (body) => ({
  accessToken: body.access_token,
  refreshToken: body.refresh_token ?? null,
  expiresAt: new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000),
});

// --- Google ---------------------------------------------------------------------------------------------------------

const GOOGLE_EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GOOGLE_RESPONSES = { accepted: 'accepted', tentative: 'tentative', declined: 'declined' };

const google = {
  id: 'google',
  label: 'Google Calendar',
  configured: () => Boolean(config.calendar.google.clientId && config.calendar.google.clientSecret),
  authUrl: (state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: config.calendar.google.clientId,
      redirect_uri: redirectUri('google'),
      response_type: 'code',
      scope: 'openid email https://www.googleapis.com/auth/calendar.events',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    })}`,
  async exchangeCode(code) {
    const body = await call('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: { code, client_id: config.calendar.google.clientId, client_secret: config.calendar.google.clientSecret, redirect_uri: redirectUri('google'), grant_type: 'authorization_code' },
    });
    return { ...tokensFrom(body), accountEmail: emailFromIdToken(body.id_token) };
  },
  async refresh(refreshToken) {
    const body = await call('https://oauth2.googleapis.com/token', {
      method: 'POST',
      form: { refresh_token: refreshToken, client_id: config.calendar.google.clientId, client_secret: config.calendar.google.clientSecret, grant_type: 'refresh_token' },
    });
    return tokensFrom(body);
  },
  eventBody: (event) => ({
    summary: event.title,
    description: event.description,
    location: event.location,
    start: { dateTime: event.start.toISOString() },
    end: { dateTime: event.end.toISOString() },
    attendees: event.attendees.map((person) => ({ email: person.email, displayName: person.name })),
    guestsCanModify: false,
  }),
  async saveEvent(token, externalId, event) {
    const url = externalId ? `${GOOGLE_EVENTS}/${encodeURIComponent(externalId)}?sendUpdates=all` : `${GOOGLE_EVENTS}?sendUpdates=all`;
    const body = await call(url, { method: externalId ? 'PATCH' : 'POST', token, json: { ...google.eventBody(event), status: 'confirmed' } });
    return { id: body.id };
  },
  async cancelEvent(token, externalId) {
    await call(`${GOOGLE_EVENTS}/${encodeURIComponent(externalId)}?sendUpdates=all`, { method: 'DELETE', token });
  },
  async getEvent(token, externalId) {
    const body = await call(`${GOOGLE_EVENTS}/${encodeURIComponent(externalId)}`, { token });
    return {
      start: new Date(body.start?.dateTime ?? body.start?.date),
      end: new Date(body.end?.dateTime ?? body.end?.date),
      cancelled: body.status === 'cancelled',
      attendees: (body.attendees ?? []).filter((person) => !person.organizer).map((person) => ({ email: person.email, response: GOOGLE_RESPONSES[person.responseStatus] ?? null })),
    };
  },
  /** When the person is busy between `from` and `to`: [{ start, end }]. */
  async busy(token, from, to) {
    const body = await call('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      token,
      json: { timeMin: from.toISOString(), timeMax: to.toISOString(), items: [{ id: 'primary' }] },
    });
    return (body.calendars?.primary?.busy ?? []).map((slot) => ({ start: new Date(slot.start), end: new Date(slot.end) }));
  },
};

// --- Microsoft ------------------------------------------------------------------------------------------------------

const GRAPH = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_RESPONSES = { accepted: 'accepted', tentativelyAccepted: 'tentative', declined: 'declined' };
const microsoftAuthority = () => `https://login.microsoftonline.com/${encodeURIComponent(config.calendar.microsoft.tenant)}/oauth2/v2.0`;
const MICROSOFT_SCOPES = 'offline_access openid email User.Read Calendars.ReadWrite';
/** Graph wants local times without an offset, with the zone named separately. */
const graphTime = (date) => ({ dateTime: date.toISOString().replace(/\.\d{3}Z$/, ''), timeZone: 'UTC' });
const fromGraphTime = (value) => new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value.dateTime) ? value.dateTime : `${value.dateTime}Z`);

const microsoft = {
  id: 'microsoft',
  label: 'Outlook / Microsoft 365',
  configured: () => Boolean(config.calendar.microsoft.clientId && config.calendar.microsoft.clientSecret),
  authUrl: (state) =>
    `${microsoftAuthority()}/authorize?${new URLSearchParams({
      client_id: config.calendar.microsoft.clientId,
      redirect_uri: redirectUri('microsoft'),
      response_type: 'code',
      response_mode: 'query',
      scope: MICROSOFT_SCOPES,
      prompt: 'select_account',
      state,
    })}`,
  async exchangeCode(code) {
    const body = await call(`${microsoftAuthority()}/token`, {
      method: 'POST',
      form: {
        code,
        client_id: config.calendar.microsoft.clientId,
        client_secret: config.calendar.microsoft.clientSecret,
        redirect_uri: redirectUri('microsoft'),
        grant_type: 'authorization_code',
        scope: MICROSOFT_SCOPES,
      },
    });
    const tokens = tokensFrom(body);
    const me = await call(`${GRAPH}/me?$select=mail,userPrincipalName`, { token: tokens.accessToken }).catch(() => null);
    return { ...tokens, accountEmail: me?.mail ?? me?.userPrincipalName ?? emailFromIdToken(body.id_token) };
  },
  async refresh(refreshToken) {
    const body = await call(`${microsoftAuthority()}/token`, {
      method: 'POST',
      form: { refresh_token: refreshToken, client_id: config.calendar.microsoft.clientId, client_secret: config.calendar.microsoft.clientSecret, grant_type: 'refresh_token', scope: MICROSOFT_SCOPES },
    });
    return tokensFrom(body);
  },
  eventBody: (event) => ({
    subject: event.title,
    body: { contentType: 'text', content: event.description },
    location: { displayName: event.location },
    start: graphTime(event.start),
    end: graphTime(event.end),
    attendees: event.attendees.map((person) => ({ emailAddress: { address: person.email, name: person.name }, type: 'required' })),
    allowNewTimeProposals: true,
  }),
  async saveEvent(token, externalId, event) {
    const body = await call(externalId ? `${GRAPH}/me/events/${encodeURIComponent(externalId)}` : `${GRAPH}/me/events`, {
      method: externalId ? 'PATCH' : 'POST',
      token,
      json: microsoft.eventBody(event),
    });
    return { id: body?.id ?? externalId };
  },
  /** Cancelling (rather than deleting) sends the attendees a cancellation. */
  async cancelEvent(token, externalId) {
    await call(`${GRAPH}/me/events/${encodeURIComponent(externalId)}/cancel`, { method: 'POST', token, json: { comment: 'The meeting was cancelled.' } });
  },
  async getEvent(token, externalId) {
    const body = await call(`${GRAPH}/me/events/${encodeURIComponent(externalId)}?$select=start,end,isCancelled,attendees`, {
      token,
      headers: { Prefer: 'outlook.timezone="UTC"' },
    });
    return {
      start: fromGraphTime(body.start),
      end: fromGraphTime(body.end),
      cancelled: Boolean(body.isCancelled),
      attendees: (body.attendees ?? []).map((person) => ({ email: person.emailAddress?.address, response: MICROSOFT_RESPONSES[person.status?.response] ?? null })),
    };
  },
  async busy(token, from, to) {
    const query = new URLSearchParams({ startDateTime: from.toISOString(), endDateTime: to.toISOString(), $select: 'start,end,showAs,isCancelled', $top: '250' });
    const body = await call(`${GRAPH}/me/calendarView?${query}`, { token, headers: { Prefer: 'outlook.timezone="UTC"' } });
    return (body.value ?? [])
      .filter((event) => !event.isCancelled && event.showAs !== 'free')
      .map((event) => ({ start: fromGraphTime(event.start), end: fromGraphTime(event.end) }));
  },
};

export const PROVIDERS = { google, microsoft };
