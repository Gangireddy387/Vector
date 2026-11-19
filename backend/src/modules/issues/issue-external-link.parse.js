import { ApiError } from '../../shared/errors/api-error.js';

/**
 * Parses a pasted GitHub / GitLab (or generic https) URL into structured fields.
 * @returns {{ provider: string, host: string, owner: string|null, repo: string|null, number: number|null, kind: string|null, url: string, label: string }}
 */
export function parseExternalIssueUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) throw ApiError.badRequest('Enter a GitHub or GitLab URL', [{ path: 'url', message: 'Required' }]);

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw ApiError.badRequest('Enter a valid URL', [{ path: 'url', message: 'Invalid URL' }]);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw ApiError.badRequest('URL must be http(s)', [{ path: 'url', message: 'Use https' }]);
  }

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, '');
  const url = parsed.toString();

  // github.com/owner/repo/issues/123 or /pull/123
  let match = path.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)$/i);
  if (match && (host === 'github.com' || host.endsWith('.github.com'))) {
    const [, owner, repo, kindRaw, number] = match;
    const kind = kindRaw.toLowerCase() === 'pull' ? 'pull' : 'issue';
    return {
      provider: 'github',
      host,
      owner,
      repo,
      number: Number(number),
      kind,
      url,
      label: `${owner}/${repo}#${number}`,
    };
  }

  // gitlab.com/group/repo/-/issues/123 or /-/merge_requests/123 (groups may include subgroups)
  match = path.match(/^\/(.+)\/-\/(issues|merge_requests)\/(\d+)$/i);
  if (match) {
    const [, projectPath, kindRaw, number] = match;
    const parts = projectPath.split('/').filter(Boolean);
    const repo = parts.at(-1) || null;
    const owner = parts.length > 1 ? parts.slice(0, -1).join('/') : parts[0] || null;
    const kind = kindRaw.toLowerCase() === 'merge_requests' ? 'merge_request' : 'issue';
    return {
      provider: 'gitlab',
      host,
      owner,
      repo,
      number: Number(number),
      kind,
      url,
      label: owner && repo ? `${owner}/${repo}#${number}` : `${host}${path}`,
    };
  }

  // Self-hosted GitLab-style without github.com
  match = path.match(/^\/([^/]+)\/([^/]+)\/(issues|pulls?)\/(\d+)$/i);
  if (match && host !== 'github.com' && !host.endsWith('.github.com')) {
    const [, owner, repo, , number] = match;
    return {
      provider: 'other',
      host,
      owner,
      repo,
      number: Number(number),
      kind: 'issue',
      url,
      label: `${owner}/${repo}#${number}`,
    };
  }

  const shortPath = path.length > 60 ? `${path.slice(0, 57)}…` : path || '/';
  return {
    provider: 'other',
    host,
    owner: null,
    repo: null,
    number: null,
    kind: null,
    url,
    label: `${host}${shortPath}`,
  };
}

export function serializeExternalLink(row) {
  return {
    id: row.id,
    provider: row.provider,
    url: row.url,
    host: row.host,
    owner: row.owner,
    repo: row.repo,
    number: row.number,
    kind: row.kind,
    label: row.label,
    createdAt: row.createdAt,
  };
}
