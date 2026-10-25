import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ApiError } from '../../shared/errors/api-error.js';

const AVATAR_DIR = path.join(config.uploads.dir, 'avatars');
const MAX_BYTES = 2 * 1024 * 1024;
/** Public URL prefix; files are served by GET /api/avatars/:fileName. */
const URL_PREFIX = '/api/avatars/';
export const AVATAR_FILE_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;

fs.mkdirSync(AVATAR_DIR, { recursive: true });

export const avatarUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single('avatar');

/** Detects the real image type from the file's first bytes; the declared MIME type is not trusted. */
function detectImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

async function removeStoredAvatar(avatarUrl) {
  const fileName = avatarUrl?.startsWith(URL_PREFIX) ? avatarUrl.slice(URL_PREFIX.length) : null;
  if (!fileName || !AVATAR_FILE_PATTERN.test(fileName)) return;
  await fs.promises.unlink(path.join(AVATAR_DIR, fileName)).catch((error) => {
    if (error.code !== 'ENOENT') console.warn('[avatars] could not delete', fileName, error.message);
  });
}

export async function setAvatar(user, file) {
  if (!file) throw ApiError.badRequest('Choose an image to upload');
  const type = detectImageType(file.buffer);
  if (!type) throw ApiError.badRequest('Use a PNG, JPEG, WebP or GIF image');

  const fileName = `${crypto.randomUUID()}.${type.ext}`;
  await fs.promises.writeFile(path.join(AVATAR_DIR, fileName), file.buffer);
  const previous = user.avatarUrl;
  await user.update({ avatarUrl: `${URL_PREFIX}${fileName}` });
  await removeStoredAvatar(previous);
  return user.toJSON();
}

export async function clearAvatar(user) {
  const previous = user.avatarUrl;
  await user.update({ avatarUrl: null });
  await removeStoredAvatar(previous);
  return user.toJSON();
}

export function resolveAvatarFile(fileName) {
  if (!AVATAR_FILE_PATTERN.test(fileName)) throw ApiError.notFound('Image not found');
  const filePath = path.join(AVATAR_DIR, fileName);
  if (!fs.existsSync(filePath)) throw ApiError.notFound('Image not found');
  return filePath;
}
