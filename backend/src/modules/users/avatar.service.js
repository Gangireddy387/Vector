import { createImageStore } from '../../shared/services/image-store.js';

const avatars = createImageStore({ folder: 'avatars', urlPrefix: '/api/avatars/', field: 'avatar' });

export const avatarUpload = avatars.upload;
export const resolveAvatarFile = avatars.resolve;

export async function setAvatar(user, file) {
  const avatarUrl = await avatars.save(file);
  const previous = user.avatarUrl;
  await user.update({ avatarUrl });
  await avatars.remove(previous);
  return user.toJSON();
}

export async function clearAvatar(user) {
  const previous = user.avatarUrl;
  await user.update({ avatarUrl: null });
  await avatars.remove(previous);
  return user.toJSON();
}
