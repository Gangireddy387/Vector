import crypto from 'node:crypto';

/** Verify GitLab's `X-Gitlab-Token` against the org secret (constant-time). */
export function verifyGitlabToken(providedHeader, secret) {
  if (!secret || providedHeader == null || providedHeader === '') return false;
  const provided = String(providedHeader);
  const expected = String(secret);
  if (expected.length !== provided.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export function newGitlabWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export function secretPrefixOf(secret) {
  return String(secret || '').slice(0, 8);
}
