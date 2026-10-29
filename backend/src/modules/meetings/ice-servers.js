import crypto from 'node:crypto';
import { config } from '../../config/index.js';

const settings = config.meetings;

/** Browsers stall on TURN over port 53, so those addresses are left out. */
const usableUrls = (urls) => [urls].flat().filter((url) => !/:53(\?|$)/.test(url));

async function cloudflareServers(userId) {
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${settings.cloudflareTurnKeyId}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.cloudflareTurnApiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: settings.turnTtlSeconds, customIdentifier: userId }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Cloudflare TURN answered ${response.status}`);
  const { iceServers } = await response.json();
  return [iceServers]
    .flat()
    .filter(Boolean)
    .map((server) => ({ ...server, urls: usableUrls(server.urls) }))
    .filter((server) => server.urls.length);
}

/** coturn's shared-secret scheme: the username carries its expiry, the password is an HMAC of it. */
function coturnServer(userId) {
  const username = `${Math.floor(Date.now() / 1000) + settings.turnTtlSeconds}:${userId}`;
  const credential = crypto.createHmac('sha1', settings.turnSecret).update(username).digest('base64');
  return { urls: settings.turnUrls, username, credential };
}

export const relayConfigured = () =>
  Boolean((settings.cloudflareTurnKeyId && settings.cloudflareTurnApiToken) || (settings.turnUrls.length && (settings.turnSecret || settings.turnUsername)));

/**
 * The servers a browser uses to reach the other people in a call. A relay (TURN) is included when configured; without
 * one, calls still work on most networks but not behind strict firewalls.
 */
export async function iceServersFor(userId) {
  const servers = settings.stunUrls.length ? [{ urls: settings.stunUrls }] : [];
  try {
    if (settings.cloudflareTurnKeyId && settings.cloudflareTurnApiToken) {
      servers.push(...(await cloudflareServers(userId)));
    } else if (settings.turnUrls.length && settings.turnSecret) {
      servers.push(coturnServer(userId));
    } else if (settings.turnUrls.length && settings.turnUsername) {
      servers.push({ urls: settings.turnUrls, username: settings.turnUsername, credential: settings.turnPassword });
    }
  } catch (error) {
    console.error('[meetings] could not get TURN credentials:', error.message);
  }
  return { iceServers: servers, relay: servers.some((server) => server.username), ttlSeconds: settings.turnTtlSeconds };
}
