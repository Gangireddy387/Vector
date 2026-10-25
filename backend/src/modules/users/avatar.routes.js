import { Router } from 'express';
import { avatarUpload, clearAvatar, resolveAvatarFile, setAvatar } from './avatar.service.js';

/** Public: <img> tags cannot send the bearer token, so files use unguessable names instead. */
export const publicAvatarRoutes = Router();
publicAvatarRoutes.get('/avatars/:fileName', (req, res) => {
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.sendFile(resolveAvatarFile(req.params.fileName));
});

/** Signed-in user manages their own photo. */
export const avatarRoutes = Router();
avatarRoutes.post('/users/me/avatar', avatarUpload, async (req, res) => res.json({ user: { ...(await setAvatar(req.user, req.file)), workspaceRole: req.organizationRole ?? 'member' } }));
avatarRoutes.delete('/users/me/avatar', async (req, res) => res.json({ user: { ...(await clearAvatar(req.user)), workspaceRole: req.organizationRole ?? 'member' } }));
