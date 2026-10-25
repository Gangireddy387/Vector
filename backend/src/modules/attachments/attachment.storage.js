import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../../config/index.js';

fs.mkdirSync(config.uploads.dir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    const folder = path.join(config.uploads.dir, new Date().toISOString().slice(0, 7));
    fs.mkdirSync(folder, { recursive: true });
    callback(null, folder);
  },
  filename: (_req, file, callback) => {
    callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: config.uploads.maxFileSizeMb * 1024 * 1024, files: 10 },
});

export const toStorageKey = (absolutePath) => path.relative(config.uploads.dir, absolutePath).split(path.sep).join('/');

export const resolveStoragePath = (storageKey) => {
  const resolved = path.resolve(config.uploads.dir, storageKey);
  if (!resolved.startsWith(config.uploads.dir)) throw new Error('Invalid storage key');
  return resolved;
};

export async function deleteStoredFile(storageKey) {
  try {
    await fs.promises.unlink(resolveStoragePath(storageKey));
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[attachments] could not delete file', storageKey, error.message);
  }
}
