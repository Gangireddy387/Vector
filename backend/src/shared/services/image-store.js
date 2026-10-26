import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ApiError } from '../errors/api-error.js';

const FILE_PATTERN = /^[a-f0-9-]{36}\.(png|jpg|webp|gif)$/;

/** Detects the real image type from the file's first bytes; the declared MIME type is not trusted. */
function detectImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/**
 * Small public images (profile photos, organization logos) stored under `uploads/<folder>` with unguessable names,
 * because <img> tags cannot send the bearer token. Files are served by GET `<urlPrefix><fileName>`.
 */
export function createImageStore({ folder, urlPrefix, field, maxBytes = 2 * 1024 * 1024 }) {
  const directory = path.join(config.uploads.dir, folder);
  fs.mkdirSync(directory, { recursive: true });

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single(field);

  /** Writes a validated image and returns its public URL. */
  async function save(file) {
    if (!file) throw ApiError.badRequest('Choose an image to upload');
    const type = detectImageType(file.buffer);
    if (!type) throw ApiError.badRequest('Use a PNG, JPEG, WebP or GIF image');
    const fileName = `${crypto.randomUUID()}.${type.ext}`;
    await fs.promises.writeFile(path.join(directory, fileName), file.buffer);
    return `${urlPrefix}${fileName}`;
  }

  async function remove(url) {
    const fileName = url?.startsWith(urlPrefix) ? url.slice(urlPrefix.length) : null;
    if (!fileName || !FILE_PATTERN.test(fileName)) return;
    await fs.promises.unlink(path.join(directory, fileName)).catch((error) => {
      if (error.code !== 'ENOENT') console.warn(`[${folder}] could not delete`, fileName, error.message);
    });
  }

  function resolve(fileName) {
    if (!FILE_PATTERN.test(fileName)) throw ApiError.notFound('Image not found');
    const filePath = path.join(directory, fileName);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Image not found');
    return filePath;
  }

  return { upload, save, remove, resolve };
}
