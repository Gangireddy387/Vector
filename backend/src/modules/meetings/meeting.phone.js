import crypto from 'node:crypto';
import express, { Router } from 'express';
import { SipClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import { config } from '../../config/index.js';
import { Meeting } from '../../database/models.js';
import { logger } from '../../shared/logger.js';
import { isUuid } from '../../shared/utils/ids.js';
import { recordArrival, recordDeparture } from './meeting.attendance.js';
import { livekitHttpUrl, roomFor, rooms, sfuEnabled } from './meeting.media.js';
import { currentCall, getIo } from './meeting.signaling.js';

/**
 * Joining a call by phone, through LiveKit's SIP service: a phone number (DIALIN_NUMBER) routed to LiveKit by a SIP
 * trunk, and one dispatch rule per meeting that sends callers who type its PIN into the meeting's main room.
 *
 * Phone callers are not part of the app's call state (they have no socket): they appear as LiveKit participants whose
 * identity starts with `sip_`. The host can mute or remove them; LiveKit's webhook records when they come and go.
 */

const settings = config.livekit;
const PHONE_PREFIX = 'sip_';
const log = { warn: (message, fields) => logger.warn(`[meetings] ${message}`, fields) };

export const phoneEnabled = () => sfuEnabled() && Boolean(settings.dialInNumber);
export const isPhoneIdentity = (identity) => typeof identity === 'string' && identity.startsWith(PHONE_PREFIX);

let sipClient = null;
const sip = () => (sipClient ??= new SipClient(livekitHttpUrl(), settings.apiKey, settings.apiSecret));

/** How to join this meeting by phone (null without dial-in). */
export const dialInFor = (meeting) => (phoneEnabled() && meeting.dialInPin ? { number: settings.dialInNumber, pin: meeting.dialInPin } : null);

/** A PIN no other meeting still on the calendar uses. */
async function newPin() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = String(crypto.randomInt(0, 1_000_000_000)).padStart(9, '0');
    if (!(await Meeting.count({ where: { dialInPin: pin, status: ['scheduled', 'live'] } }))) return pin;
  }
  throw new Error('Could not choose a unique dial-in PIN');
}

/** Gives a scheduled meeting its dial-in PIN (once). Failures leave the meeting without one; it still works. */
export async function ensureDialIn(meeting) {
  if (!phoneEnabled() || meeting.dialInPin || ['ended', 'cancelled'].includes(meeting.status)) return meeting;
  try {
    const pin = await newPin();
    const rule = await sip().createSipDispatchRule(
      { type: 'direct', roomName: roomFor(meeting.id, null), pin },
      { name: `Vector meeting ${meeting.id}`, trunkIds: settings.sipTrunkIds.length ? settings.sipTrunkIds : undefined, metadata: JSON.stringify({ meetingId: meeting.id }) },
    );
    await meeting.update({ dialInPin: pin, sipRuleId: rule.sipDispatchRuleId });
  } catch (error) {
    log.warn('could not set up dial-in', { meetingId: meeting.id, error: error.message });
  }
  return meeting;
}

/** Stops the meeting's PIN from working (meeting over, cancelled or deleted). */
export async function releaseDialIn(meeting) {
  if (!meeting.sipRuleId) return;
  if (sfuEnabled()) {
    try {
      await sip().deleteSipDispatchRule(meeting.sipRuleId);
    } catch (error) {
      if (!/not found|404/i.test(error.message ?? '')) log.warn('could not remove the dial-in rule', { meetingId: meeting.id, error: error.message });
    }
  }
  if (!meeting.isNewRecord) await Meeting.update({ sipRuleId: null }, { where: { id: meeting.id } }).catch(() => undefined);
}

/** Who the caller is, without showing their whole number to everyone. */
export function phoneCallerName(participant) {
  const number = participant.attributes?.['sip.phoneNumber'] || participant.identity.slice(PHONE_PREFIX.length);
  const digits = String(number).replace(/[^\d+]/g, '');
  if (participant.name && !/^\+?\d[\d\s-]*$/.test(participant.name)) return participant.name;
  return digits.length > 4 ? `Phone (…${digits.slice(-4)})` : 'Phone caller';
}

/** Host controls for phone callers in the main room. */
export function registerMeetingPhone(io, socket) {
  const fail = (ack, error) => ack?.({ ok: false, error });

  async function hostAndCaller(identity, ack) {
    const here = await currentCall(socket);
    if (!here?.peer.canManage) return fail(ack, 'Only the host or a co-host can do that');
    if (!sfuEnabled() || !isPhoneIdentity(identity)) return fail(ack, 'That caller is not in the call');
    return here;
  }

  socket.on('meeting:phone:mute', async ({ identity } = {}, ack) => {
    const here = await hostAndCaller(identity, ack);
    if (!here) return;
    try {
      const room = roomFor(here.meetingId, null);
      const participant = await rooms().getParticipant(room, identity);
      for (const track of participant.tracks ?? []) {
        if (!track.muted && (track.source === TrackSource.MICROPHONE || track.type === 0)) await rooms().mutePublishedTrack(room, identity, track.sid, true);
      }
      io.to(`meeting:${here.meetingId}`).emit('meeting:phone:muted', { identity, by: here.peer.user.name });
      ack?.({ ok: true });
    } catch {
      fail(ack, 'That caller is not in the call any more');
    }
  });

  socket.on('meeting:phone:remove', async ({ identity } = {}, ack) => {
    const here = await hostAndCaller(identity, ack);
    if (!here) return;
    try {
      await rooms().removeParticipant(roomFor(here.meetingId, null), identity);
      ack?.({ ok: true });
    } catch {
      fail(ack, 'That caller is not in the call any more');
    }
  });
}

// --- LiveKit webhook ------------------------------------------------------------------------------------------------

let receiver = null;
const webhooks = () => (receiver ??= new WebhookReceiver(settings.apiKey, settings.apiSecret));
const MAIN_ROOM = /^meeting-([0-9a-f-]{36})$/i;

/** What LiveKit reports about a room: phone callers coming and going are kept in the meeting's attendance. */
export async function handleLivekitEvent(event) {
  const meetingId = MAIN_ROOM.exec(event.room?.name ?? '')?.[1];
  const participant = event.participant;
  if (!meetingId || !isUuid(meetingId) || !participant || !isPhoneIdentity(participant.identity)) return;
  const sessionKey = `phone:${participant.sid}`;
  if (event.event === 'participant_joined') {
    await recordArrival(meetingId, { userId: null, name: phoneCallerName(participant), email: null, kind: 'phone', sessionKey });
    getIo()?.to(`meeting:${meetingId}`).emit('meeting:phone:joined', { identity: participant.identity, name: phoneCallerName(participant) });
  } else if (event.event === 'participant_left') {
    await recordDeparture(meetingId, sessionKey);
    getIo()?.to(`meeting:${meetingId}`).emit('meeting:phone:left', { identity: participant.identity });
  }
}

/** Public: LiveKit signs each call with the API secret (checked here); no app sign-in. */
export const livekitWebhookRoutes = Router();

livekitWebhookRoutes.post('/livekit/webhook', express.raw({ type: ['application/webhook+json', 'application/json'], limit: '256kb' }), async (req, res) => {
  if (!sfuEnabled()) return res.status(404).end();
  let event;
  try {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body ?? {});
    event = await webhooks().receive(body, req.get('Authorization'));
  } catch {
    return res.status(401).end();
  }
  try {
    await handleLivekitEvent(event);
  } catch (error) {
    log.warn('could not handle a LiveKit event', { event: event.event, error: error.message });
  }
  res.status(200).end();
});
