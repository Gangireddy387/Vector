import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { config } from '../../config/index.js';

/**
 * How video travels in a call. Without a media server, browsers connect to each other directly (small calls). With
 * LiveKit configured, everyone sends their video once to LiveKit, which forwards it: calls can be much larger, and
 * muting, removing people and sharing permissions are enforced by the server instead of trusted to each browser.
 *
 * In LiveKit each call room (main or breakout) is its own LiveKit room, and a person's identity there is their
 * socket id, which is how the app matches video to the people in its call.
 */

const settings = config.livekit;
export const sfuEnabled = () => Boolean(settings.url && settings.apiKey && settings.apiSecret);
export const callCapacity = () => (sfuEnabled() ? settings.callSize : config.meetings.directCallSize);

const roomFor = (meetingId, room) => `meeting-${meetingId}${room ? `-${room}` : ''}`;

let service = null;
const rooms = () => (service ??= new RoomServiceClient(settings.url.replace(/^ws/, 'http'), settings.apiKey, settings.apiSecret));

/** What this person may send: the people running the call everything; others what the host allows. */
export function publishSources(peer, permissions) {
  if (peer.canManage) return ['camera', 'microphone', 'screen_share', 'screen_share_audio'];
  return ['camera', ...(permissions.unmute ? ['microphone'] : []), ...(permissions.share ? ['screen_share', 'screen_share_audio'] : [])];
}

const SOURCE_VALUES = { camera: TrackSource.CAMERA, microphone: TrackSource.MICROPHONE, screen_share: TrackSource.SCREEN_SHARE, screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO };
const sourceValues = (peer, permissions) => publishSources(peer, permissions).map((source) => SOURCE_VALUES[source]);

/** How the browser should connect its media for `peer` in `room` (null: the main room). */
export async function mediaFor(meetingId, room, peer, permissions) {
  if (!sfuEnabled()) return { mode: 'direct' };
  const token = new AccessToken(settings.apiKey, settings.apiSecret, {
    identity: peer.socketId,
    name: peer.user.name,
    ttl: '8h',
    metadata: JSON.stringify({ userId: peer.user.id }),
  });
  token.addGrant({
    room: roomFor(meetingId, room),
    roomJoin: true,
    canSubscribe: true,
    canPublish: true,
    canPublishData: false,
    canPublishSources: sourceValues(peer, permissions),
  });
  return { mode: 'sfu', url: settings.url, token: await token.toJwt() };
}

async function quietly(action, what) {
  try {
    return await action();
  } catch (error) {
    // The person may not have connected their media yet, or already left; the app's own state still applies.
    if (!/not found|404/i.test(error.message ?? '')) console.warn(`[meetings] media server could not ${what}:`, error.message);
    return null;
  }
}

async function muteSource(meetingId, peer, source) {
  if (!sfuEnabled()) return;
  const room = roomFor(meetingId, peer.room);
  const participant = await quietly(() => rooms().getParticipant(room, peer.socketId), 'find a participant');
  for (const track of participant?.tracks ?? []) {
    if (track.source === source && !track.muted) await quietly(() => rooms().mutePublishedTrack(room, peer.socketId, track.sid, true), 'mute a track');
  }
}

export const sfuMuteMicrophone = (meetingId, peer) => muteSource(meetingId, peer, TrackSource.MICROPHONE);
export const sfuStopScreen = (meetingId, peer) => muteSource(meetingId, peer, TrackSource.SCREEN_SHARE);

export async function sfuRemove(meetingId, peer) {
  if (!sfuEnabled()) return;
  await quietly(() => rooms().removeParticipant(roomFor(meetingId, peer.room), peer.socketId), 'remove a participant');
}

/** Applies what the person may send now (after a permission or role change). */
export async function sfuApplyPermissions(meetingId, peer, permissions) {
  if (!sfuEnabled()) return;
  const canPublishSources = sourceValues(peer, permissions);
  await quietly(
    () => rooms().updateParticipant(roomFor(meetingId, peer.room), peer.socketId, { permission: { canSubscribe: true, canPublish: true, canPublishData: false, canPublishSources } }),
    'update permissions',
  );
}
