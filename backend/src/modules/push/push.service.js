import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { config } from '../../config/index.js';
import { PushSubscription } from '../../database/models.js';

let keys = null;

/**
 * VAPID keys identify this server to the browsers' push services. Changing them silently ends every subscription,
 * so keys generated without configuration are written to a file and reused after restarts.
 */
function vapidKeys() {
  if (keys) return keys;
  const settings = config.push;
  if (settings.publicKey && settings.privateKey) {
    keys = { publicKey: settings.publicKey, privateKey: settings.privateKey };
  } else {
    try {
      keys = JSON.parse(fs.readFileSync(settings.keysFile, 'utf8'));
    } catch {
      keys = null;
    }
    if (!keys?.publicKey || !keys?.privateKey) {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(path.dirname(settings.keysFile), { recursive: true });
      fs.writeFileSync(settings.keysFile, JSON.stringify(keys, null, 2), { mode: 0o600 });
      console.info(`[push] generated VAPID keys in ${settings.keysFile} (set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to manage them yourself)`);
    }
  }
  webpush.setVapidDetails(settings.subject || `mailto:${config.sendgrid.fromEmail}`, keys.publicKey, keys.privateKey);
  return keys;
}

export const pushPublicKey = () => vapidKeys().publicKey;

export async function savePushSubscription(userId, { endpoint, keys: { p256dh, auth } }, userAgent = null) {
  const values = { userId, p256dh, auth, userAgent: userAgent?.slice(0, 255) ?? null };
  const existing = await PushSubscription.findOne({ where: { endpoint } });
  if (existing) await existing.update(values);
  else await PushSubscription.create({ endpoint, ...values });
}

export const removePushSubscription = (userId, endpoint) => PushSubscription.destroy({ where: { userId, endpoint } });

/**
 * Shows a notification on every device these people turned notifications on for, even when Vector is closed.
 * `payload`: { kind, title, body, url, tag }. Devices the push service no longer knows are forgotten.
 */
export async function pushToUsers(userIds, payload, { ttlSeconds = 60 } = {}) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  vapidKeys();
  const subscriptions = await PushSubscription.findAll({ where: { userId: ids } });
  const body = JSON.stringify(payload);
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, body, {
          TTL: ttlSeconds,
          urgency: 'high',
        });
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) await subscription.destroy().catch(() => undefined);
        else console.warn(`[push] could not notify a device: ${error.statusCode ?? error.message}`);
      }
    }),
  );
  return subscriptions.length;
}
