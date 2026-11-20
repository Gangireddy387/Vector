import { config } from '../../config/index.js';

/**
 * MIME types the browser can show in-page (lightbox / iframe / media). Everything else downloads.
 * Keep ACTIVE_TYPES forced to octet-stream so HTML/SVG/JS never execute from our file hosts.
 */

/** Types a browser could run as a page or script; always handed over as plain downloads. */
export const ACTIVE_TYPES =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript)/i;

/** Safe to serve with Content-Disposition: inline for in-app preview. */
export const INLINE_TYPES =
  /^(image\/(png|jpeg|gif|webp)|application\/pdf|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|wav|ogg|webm|aac|flac|x-m4a|mp4))$/i;

/** Word / Excel / PowerPoint — preview via Microsoft Office Online when a public HTTPS URL exists. */
export const OFFICE_TYPES =
  /^(application\/(msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)))$/i;

export const isInlineMime = (mimeType) => INLINE_TYPES.test(mimeType ?? '');
export const isActiveMime = (mimeType) => ACTIVE_TYPES.test(mimeType ?? '');
export const isOfficeMime = (mimeType) => OFFICE_TYPES.test(mimeType ?? '');

/** Content-Type for responses: strip executable types. */
export const safeResponseMime = (mimeType) =>
  isActiveMime(mimeType) ? 'application/octet-stream' : mimeType || 'application/octet-stream';

/** Absolute API URL for a relative `/api/...` path (Office Online must fetch this). */
export function absolutePublicUrl(relativeApiPath) {
  const base = (config.calendar?.publicApiUrl || '').replace(/\/$/, '');
  if (!base || !relativeApiPath) return null;
  const path = relativeApiPath.startsWith('/') ? relativeApiPath : `/${relativeApiPath}`;
  return `${base}${path}`;
}

/** Office Online only works when Microsoft can reach an https (non-local) absolute URL. */
export function canUseOfficeOnline(absoluteUrl) {
  if (!absoluteUrl || !/^https:\/\//i.test(absoluteUrl)) return false;
  try {
    const host = new URL(absoluteUrl).hostname;
    return host !== 'localhost' && host !== '127.0.0.1' && !host.endsWith('.local');
  } catch {
    return false;
  }
}

export function officeOnlineEmbedUrl(absoluteFileUrl) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(absoluteFileUrl)}`;
}
