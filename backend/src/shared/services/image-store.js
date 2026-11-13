import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config/index.js';
import { ApiError } from '../errors/api-error.js';

/** Detects the real image type from the file's first bytes; the declared MIME type is not trusted. */
function detectImageType(buffer) {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.toString('ascii', 0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Detects common audio formats from the file's first bytes. */
export function detectAudioType(buffer) {
  if (buffer.length < 12) return null;
  const ascii = (start, end) => buffer.toString('ascii', start, end);
  if (ascii(0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (ascii(0, 4) === 'fLaC') return { ext: 'flac', mime: 'audio/flac' };
  if (ascii(4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  return null;
}

/**
 * Small public files (profile photos, organization logos, ringtones) stored under `uploads/<folder>` with unguessable
 * names, because <img> and <audio> cannot send the bearer token. Files are served by GET `<urlPrefix><fileName>`.
 */
export function createFileStore({ folder, urlPrefix, field, maxBytes = 2 * 1024 * 1024, detect, extensions, kind, typeMessage }) {
  const directory = path.join(config.uploads.dir, folder);
  fs.mkdirSync(directory, { recursive: true });
  const filePattern = new RegExp(`^[a-f0-9-]{36}\\.(${extensions.join('|')})$`);

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes, files: 1 } }).single(field);

  /** Writes a validated file and returns its public URL. */
  async function save(file) {
    if (!file) throw ApiError.badRequest(`Choose ${kind} to upload`);
    const type = detect(file.buffer);
    if (!type || !extensions.includes(type.ext)) throw ApiError.badRequest(typeMessage);
    const fileName = `${crypto.randomUUID()}.${type.ext}`;
    await fs.promises.writeFile(path.join(directory, fileName), file.buffer);
    return `${urlPrefix}${fileName}`;
  }

  async function remove(url) {
    const fileName = url?.startsWith(urlPrefix) ? url.slice(urlPrefix.length) : null;
    if (!fileName || !filePattern.test(fileName)) return;
    await fs.promises.unlink(path.join(directory, fileName)).catch((error) => {
      if (error.code !== 'ENOENT') console.warn(`[${folder}] could not delete`, fileName, error.message);
    });
  }

  function resolve(fileName) {
    if (!filePattern.test(fileName)) throw ApiError.notFound('File not found');
    const filePath = path.join(directory, fileName);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('File not found');
    return filePath;
  }

  return { upload, save, remove, resolve };
}

/** Profile photos and organization logos. */
export const createImageStore = (options) =>
  createFileStore({
    ...options,
    detect: detectImageType,
    extensions: ['png', 'jpg', 'webp', 'gif'],
    kind: 'an image',
    typeMessage: 'Use a PNG, JPEG, WebP or GIF image',
  });
