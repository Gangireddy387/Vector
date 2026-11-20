import crypto from 'node:crypto';

/** Verify GitHub's `X-Hub-Signature-256` against the raw request body. */
export function verifyGithubSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const provided = String(signatureHeader);
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export function newGithubWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function secretPrefixOf(secret) {
  return String(secret || '').slice(0, 8);
}
