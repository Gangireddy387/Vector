import { EmbedApp } from '../../database/models.js';

/**
 * Access tokens from partner connect carry `eid` (embed app id) and `ever` (session version).
 * When the org admin turns the app Off (or rotates the secret), `sessionVersion` rises and these checks fail.
 * Normal Vector sign-ins have no `eid` and are unaffected.
 *
 * @returns {Promise<string|null>} Human reason when the embed session is no longer valid; otherwise null.
 */
export async function embedSessionInvalidReason(payload) {
  const embedAppId = payload?.eid;
  if (!embedAppId) return null;

  const app = await EmbedApp.findByPk(embedAppId, {
    attributes: ['id', 'enabled', 'sessionVersion'],
  });
  if (!app) return 'This partner connection was removed. Connect again from the partner app.';
  if (!app.enabled) return 'This partner connection was turned off. Connect again from the partner app.';
  if ((payload.ever ?? 0) !== (app.sessionVersion ?? 0)) {
    return 'This partner connection was turned off. Connect again from the partner app.';
  }
  return null;
}
