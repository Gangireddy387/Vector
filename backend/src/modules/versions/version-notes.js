/**
 * Deterministic markdown release notes from fix-version issues.
 * Group by type; skip subtasks (they belong under a parent).
 */

const TYPE_HEADINGS = {
  epic: 'Epics',
  story: 'Stories',
  task: 'Tasks',
  bug: 'Bug fixes',
  subtask: 'Sub-tasks',
};

const TYPE_ORDER = ['epic', 'story', 'task', 'bug', 'subtask'];

function formatDate(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * @param {{ name: string, releaseDate?: string|null, releasedAt?: Date|string|null }} version
 * @param {Array<{ key: string, title: string, type: string, status?: { category?: string }|null }>} issues
 */
export function buildReleaseNotesMarkdown(version, issues = []) {
  const dateLabel = formatDate(version.releaseDate) || formatDate(version.releasedAt) || formatDate(new Date().toISOString());
  const lines = [`# ${version.name}${dateLabel ? ` — ${dateLabel}` : ''}`, ''];

  const visible = issues.filter((issue) => issue.type !== 'subtask');
  if (!visible.length) {
    lines.push('_No fix-version issues yet._', '');
    return lines.join('\n').trim() + '\n';
  }

  const byType = new Map();
  for (const issue of visible) {
    const type = TYPE_ORDER.includes(issue.type) ? issue.type : 'task';
    const list = byType.get(type) ?? [];
    list.push(issue);
    byType.set(type, list);
  }

  for (const type of TYPE_ORDER) {
    const list = byType.get(type);
    if (!list?.length) continue;
    lines.push(`## ${TYPE_HEADINGS[type] ?? type}`, '');
    for (const issue of list.sort((a, b) => a.key.localeCompare(b.key))) {
      const done = issue.status?.category === 'done' ? '' : ' _(open)_';
      lines.push(`- ${issue.key} ${issue.title}${done}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}
