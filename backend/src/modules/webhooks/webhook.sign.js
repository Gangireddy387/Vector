import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signs a raw JSON body with HMAC-SHA256 (same header as automation webhooks).
 * @returns {{ signature: string, deliveryId: string, timestamp: string }}
 */
export function signWebhookBody(secret, body, { deliveryId = randomBytes(16).toString('hex') } = {}) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = `${deliveryId}.${timestamp}.${body}`;
  const signature = createHmac('sha256', secret).update(payload).digest('hex');
  return { signature, deliveryId, timestamp };
}

/** Verifies a signed delivery (for unit tests / consumer docs). */
export function verifyWebhookSignature(secret, body, { signature, deliveryId, timestamp, toleranceSec = 300 }) {
  if (!secret || !signature || !deliveryId || !timestamp) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${deliveryId}.${timestamp}.${body}`).digest('hex');
  try {
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(String(signature), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
