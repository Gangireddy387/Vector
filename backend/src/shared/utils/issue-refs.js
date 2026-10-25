import { Issue } from '../../database/models.js';
import { getMemberProjectIds } from '../../modules/projects/project-access.js';

/** Task keys such as `VEC-12` or `#VEC-12` anywhere in free text. */
const ISSUE_KEY_PATTERN = /(?:^|[^A-Za-z0-9-])#?([A-Za-z][A-Za-z0-9]{0,9}-\d{1,6})(?![A-Za-z0-9-])/g;

export const extractIssueKeys = (...texts) =>
  [...new Set(texts.filter(Boolean).flatMap((text) => [...String(text).matchAll(ISSUE_KEY_PATTERN)].map((match) => match[1].toUpperCase())))];

/** Resolves the task keys in some text to issues the user is allowed to see. */
export async function resolveIssueRefs(userId, ...texts) {
  const keys = extractIssueKeys(...texts);
  if (!keys.length) return [];
  const projectIds = await getMemberProjectIds(userId);
  return Issue.findAll({ where: { key: keys.slice(0, 25), projectId: projectIds } });
}
