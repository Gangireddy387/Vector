import multer from 'multer';
import { Label, Project, ProjectMember, Status, User } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { ISSUE_PRIORITIES, ISSUE_TYPES } from './issue.model.js';
import { createIssue } from './issue.service.js';

export const IMPORT_MAX_ROWS = 200;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMPORT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/plain' ||
      file.mimetype === 'application/octet-stream' ||
      name.endsWith('.csv') ||
      name.endsWith('.txt');
    cb(ok ? null : new ApiError(400, 'Upload a .csv file exported from Vector or Jira'), ok);
  },
}).single('file');

/** Normalize a CSV header to a canonical field name. */
const HEADER_ALIASES = {
  title: ['title', 'summary', 'issue summary', 'name'],
  description: ['description', 'desc'],
  type: ['type', 'issuetype', 'issue type', 'issue type name'],
  status: ['status', 'status name'],
  priority: ['priority'],
  assignee: ['assignee', 'assignee name', 'assignee email'],
  dueDate: ['duedate', 'due date', 'due'],
  storyPoints: ['storypoints', 'story points', 'story point estimate'],
  labels: ['labels', 'label', 'components', 'component'],
  project: ['project', 'project key', 'projectkey'],
};

function canonicalHeader(raw) {
  const key = String(raw ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(key)) return canonical;
  }
  return null;
}

/** RFC-style CSV parser that handles quotes and CRLF. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => String(value).trim() !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== '')) rows.push(row);
  return rows;
}

function mapType(raw) {
  if (!raw) return 'task';
  const value = String(raw).trim().toLowerCase().replace(/[\s_-]+/g, '');
  const aliases = {
    epic: 'epic',
    story: 'story',
    userstory: 'story',
    task: 'task',
    bug: 'bug',
    defect: 'bug',
    subtask: 'task', // parents are not in CSV imports; create as tasks
    subtasks: 'task',
  };
  const mapped = aliases[value] ?? value;
  return ISSUE_TYPES.includes(mapped) && mapped !== 'subtask' ? mapped : 'task';
}

function mapPriority(raw) {
  if (!raw) return 'medium';
  const value = String(raw).trim().toLowerCase();
  const aliases = {
    lowest: 'lowest',
    trivial: 'lowest',
    low: 'low',
    medium: 'medium',
    normal: 'medium',
    high: 'high',
    highest: 'highest',
    critical: 'highest',
    blocker: 'highest',
    p0: 'highest',
    p1: 'highest',
    p2: 'high',
    p3: 'medium',
    p4: 'low',
    p5: 'lowest',
  };
  const mapped = aliases[value] ?? value;
  return ISSUE_PRIORITIES.includes(mapped) ? mapped : 'medium';
}

function mapDueDate(raw) {
  if (!raw) return null;
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const iso = Date.parse(text);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString().slice(0, 10);
  // Jira-ish: 19/Nov/26 or 19/Nov/2026
  const m = text.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[m[2].toLowerCase()];
    if (month == null) return null;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const day = Number(m[1]);
    const date = new Date(Date.UTC(year, month, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date.toISOString().slice(0, 10);
  }
  return null;
}

function splitLabels(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/[;|,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function rowsToRecords(rows) {
  if (!rows.length) throw ApiError.badRequest('The CSV file is empty');
  const headers = rows[0].map(canonicalHeader);
  if (!headers.includes('title')) {
    throw ApiError.badRequest('CSV needs a Title or Summary column (Vector export or Jira CSV)');
  }
  const records = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const record = { row: i + 1 };
    headers.forEach((header, index) => {
      if (!header) return;
      record[header] = cells[index] ?? '';
    });
    records.push(record);
  }
  return records;
}

async function resolveLabelIds(projectId, names, cache) {
  const ids = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (cache.has(key)) {
      ids.push(cache.get(key));
      continue;
    }
    let label = await Label.findOne({ where: { projectId, name } });
    if (!label) {
      // Case-insensitive match among loaded project labels
      const existing = [...cache.entries()].find(([cached]) => cached === key);
      if (existing) {
        ids.push(existing[1]);
        continue;
      }
      label = await Label.create({ projectId, name: name.slice(0, 40), color: '#64748b' });
    }
    cache.set(key, label.id);
    ids.push(label.id);
  }
  return ids;
}

/**
 * Import tasks from a Vector or Jira-style CSV into one project.
 * Keys from the file are ignored — Vector always assigns new keys.
 */
export async function importIssuesCsv({ projectId, buffer, actor }) {
  if (!projectId) throw ApiError.badRequest('Choose a project to import into');
  const project = await Project.findByPk(projectId);
  if (!project) throw ApiError.notFound('Project not found');

  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer ?? '');
  const records = rowsToRecords(parseCsv(text));
  if (!records.length) throw ApiError.badRequest('No data rows found in the CSV');
  if (records.length > IMPORT_MAX_ROWS) {
    throw ApiError.badRequest(`Import is limited to ${IMPORT_MAX_ROWS} rows at a time (file has ${records.length})`);
  }

  const [statuses, memberships] = await Promise.all([
    Status.findAll({ where: { projectId }, order: [['position', 'ASC']] }),
    ProjectMember.findAll({
      where: { projectId },
      include: [{ model: User, as: 'user', attributes: USER_SUMMARY_ATTRIBUTES }],
    }),
  ]);
  if (!statuses.length) throw ApiError.badRequest('This project has no statuses yet');

  const statusByName = new Map(statuses.map((status) => [status.name.trim().toLowerCase(), status]));
  const defaultStatus = statuses.find((status) => status.category === 'todo') ?? statuses[0];
  const members = memberships.map((row) => row.user).filter(Boolean);

  const findAssignee = (raw) => {
    if (!raw) return null;
    const needle = String(raw).trim().toLowerCase();
    if (!needle) return null;
    const byEmail = members.find((user) => user.email?.toLowerCase() === needle);
    if (byEmail) return byEmail.id;
    const byName = members.filter((user) => user.name?.toLowerCase() === needle);
    return byName.length === 1 ? byName[0].id : null;
  };

  const labelCache = new Map(
    (await Label.findAll({ where: { projectId } })).map((label) => [label.name.toLowerCase(), label.id]),
  );

  const created = [];
  const errors = [];
  let skipped = 0;

  for (const record of records) {
    const title = String(record.title ?? '').trim();
    if (!title) {
      skipped += 1;
      continue;
    }
    try {
      const statusName = String(record.status ?? '').trim().toLowerCase();
      const status = (statusName && statusByName.get(statusName)) || defaultStatus;
      const dueDate = mapDueDate(record.dueDate);
      if (record.dueDate && String(record.dueDate).trim() && !dueDate) {
        throw new Error(`Could not parse due date "${record.dueDate}"`);
      }
      const pointsRaw = String(record.storyPoints ?? '').trim();
      let storyPoints = null;
      if (pointsRaw) {
        const parsed = Number.parseInt(pointsRaw, 10);
        if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) throw new Error(`Invalid story points "${pointsRaw}"`);
        storyPoints = parsed;
      }
      const assigneeRaw = String(record.assignee ?? '').trim();
      const resolvedAssignee = assigneeRaw ? findAssignee(assigneeRaw) : undefined;
      const labelIds = await resolveLabelIds(projectId, splitLabels(record.labels), labelCache);
      const issue = await createIssue(
        {
          projectId,
          title: title.slice(0, 255),
          description: record.description ? String(record.description).slice(0, 50000) : null,
          type: mapType(record.type),
          priority: mapPriority(record.priority),
          statusId: status.id,
          // Blank → allow project auto-assign; named but unknown → leave unassigned.
          ...(assigneeRaw ? { assigneeId: resolvedAssignee } : {}),
          dueDate,
          storyPoints,
          labelIds,
        },
        actor,
        { source: 'csv_import' },
      );
      created.push({ id: issue.id, key: issue.key, title: issue.title, row: record.row });
    } catch (error) {
      errors.push({ row: record.row, message: error.message || 'Could not import this row' });
    }
  }

  return {
    projectId,
    projectKey: project.key,
    created: created.length,
    skipped,
    failed: errors.length,
    issues: created,
    errors: errors.slice(0, 50),
  };
}
