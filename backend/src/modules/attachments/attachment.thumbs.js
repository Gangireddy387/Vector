import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../../config/index.js';
import { resolveStoragePath, toStorageKey } from './attachment.storage.js';

const THUMB_MAX = 320;
const IMAGE_MIME = /^image\/(png|jpeg|gif|webp)$/i;

export const canThumbnail = (mimeType) => IMAGE_MIME.test(mimeType ?? '');

/**
 * Writes a ~320px WebP sibling next to the original upload. Returns the storage key, or null if skipped/failed.
 */
export async function writeThumbnail(storageKey, mimeType) {
  if (!canThumbnail(mimeType)) return null;
  try {
    const source = resolveStoragePath(storageKey);
    const folder = path.join(config.uploads.dir, path.dirname(storageKey), 'thumbs');
    await fs.promises.mkdir(folder, { recursive: true });
    const base = path.basename(storageKey, path.extname(storageKey));
    const thumbPath = path.join(folder, `${base}.webp`);
    await sharp(source)
      .rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumbPath);
    return toStorageKey(thumbPath);
  } catch (error) {
    console.warn('[attachments] thumbnail failed', storageKey, error.message);
    return null;
  }
}
