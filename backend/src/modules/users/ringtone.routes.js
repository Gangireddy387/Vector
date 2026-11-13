import { Router } from 'express';
import { requireFeature } from '../plans/plan.service.js';
import { clearRingtone, resolveRingtoneFile, ringtoneUpload, setRingtone } from './ringtone.service.js';

/** Public: <audio> and Web Audio requests cannot send the bearer token, so files use unguessable names instead. */
export const publicRingtoneRoutes = Router();
publicRingtoneRoutes.get('/ringtones/:fileName', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(resolveRingtoneFile(req.params.fileName));
});

/** Signed-in person manages their own ringtone; uploading one needs the custom sounds plan feature. */
export const ringtoneRoutes = Router();
const withRole = (req, user) => ({ user: { ...user, workspaceRole: req.organizationRole ?? 'member' } });
ringtoneRoutes.post('/users/me/ringtone', requireFeature('customSounds'), ringtoneUpload, async (req, res) => res.json(withRole(req, await setRingtone(req.user, req.file))));
ringtoneRoutes.delete('/users/me/ringtone', async (req, res) => res.json(withRole(req, await clearRingtone(req.user))));
