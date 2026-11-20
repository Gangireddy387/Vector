import { Op } from 'sequelize';
import { Issue, IssueAffectedVersion, IssueFixVersion, Status, Version } from '../../database/models.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { buildReleaseNotesMarkdown } from './version-notes.js';

const VERSION_SUMMARY = ['id', 'name', 'status', 'releaseDate', 'releasedAt', 'startDate', 'description', 'position', 'updatedAt', 'createdAt'];

async function findVersion(projectId, versionId) {
  const version = await Version.findOne({ where: { id: versionId, projectId } });
  if (!version) throw ApiError.notFound('Version not found');
  return version;
}

async function assertUniqueName(projectId, name, excludeId = null) {
  const where = { projectId, name };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await Version.findOne({ where, attributes: ['id'] });
  if (existing) throw ApiError.conflict(`A version named "${name}" already exists in this project`);
}

async function loadFixIssues(versionId) {
  return Issue.findAll({
    where: {},
    include: [
      { model: Version, as: 'fixVersions', where: { id: versionId }, attributes: [], through: { attributes: [] }, required: true },
      { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
    ],
    attributes: ['id', 'key', 'title', 'type', 'priority', 'statusId'],
    order: [
      ['type', 'ASC'],
      ['key', 'ASC'],
    ],
  });
}

async function statsForVersions(versionIds) {
  if (!versionIds.length) return new Map();
  const rows = await IssueFixVersion.findAll({
    where: { versionId: versionIds },
    attributes: ['versionId', 'issueId'],
    raw: true,
  });
  const byVersion = new Map();
  for (const row of rows) {
    const list = byVersion.get(row.versionId) ?? [];
    list.push(row.issueId);
    byVersion.set(row.versionId, list);
  }
  const allIssueIds = [...new Set(rows.map((row) => row.issueId))];
  const doneIds = new Set();
  if (allIssueIds.length) {
    const issues = await Issue.findAll({
      where: { id: allIssueIds },
      attributes: ['id'],
      include: [{ model: Status, as: 'status', attributes: ['category'] }],
    });
    for (const issue of issues) {
      if (issue.status?.category === 'done') doneIds.add(issue.id);
    }
  }
  const stats = new Map();
  for (const versionId of versionIds) {
    const ids = byVersion.get(versionId) ?? [];
    stats.set(versionId, {
      issueCount: ids.length,
      doneCount: ids.filter((id) => doneIds.has(id)).length,
    });
  }
  return stats;
}

function toSummary(version, stats = null) {
  const json = typeof version.toJSON === 'function' ? version.toJSON() : version;
  return {
    id: json.id,
    projectId: json.projectId,
    name: json.name,
    description: json.description,
    status: json.status,
    startDate: json.startDate,
    releaseDate: json.releaseDate,
    releasedAt: json.releasedAt,
    position: json.position,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    hasReleaseNotes: Boolean(json.releaseNotes && String(json.releaseNotes).trim()),
    stats: stats ?? { issueCount: 0, doneCount: 0 },
  };
}

export async function listVersions(projectId, { status } = {}) {
  const where = { projectId };
  if (status) where.status = status;
  const versions = await Version.findAll({
    where,
    attributes: [...VERSION_SUMMARY, 'releaseNotes', 'projectId'],
    order: [
      ['status', 'ASC'],
      ['position', 'ASC'],
      ['releaseDate', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  const stats = await statsForVersions(versions.map((row) => row.id));
  return { versions: versions.map((row) => toSummary(row, stats.get(row.id))) };
}

export async function getVersion(projectId, versionId) {
  const version = await findVersion(projectId, versionId);
  const [issues, statsMap] = await Promise.all([loadFixIssues(versionId), statsForVersions([versionId])]);
  const json = version.toJSON();
  return {
    version: {
      ...toSummary(version, statsMap.get(versionId)),
      releaseNotes: json.releaseNotes ?? null,
    },
    issues: issues.map((issue) => {
      const row = issue.toJSON();
      return {
        id: row.id,
        key: row.key,
        title: row.title,
        type: row.type,
        priority: row.priority,
        status: row.status ?? null,
      };
    }),
  };
}

export async function createVersion(projectId, input) {
  await assertUniqueName(projectId, input.name);
  const maxPos = (await Version.max('position', { where: { projectId } })) ?? 0;
  const version = await Version.create({
    projectId,
    name: input.name,
    description: input.description ?? null,
    startDate: input.startDate ?? null,
    releaseDate: input.releaseDate ?? null,
    releaseNotes: input.releaseNotes ?? null,
    status: 'unreleased',
    position: maxPos + 1,
  });
  return toSummary(version, { issueCount: 0, doneCount: 0 });
}

export async function updateVersion(projectId, versionId, changes) {
  const version = await findVersion(projectId, versionId);
  if (changes.name && changes.name !== version.name) {
    await assertUniqueName(projectId, changes.name, versionId);
  }
  const updates = {};
  for (const key of ['name', 'description', 'startDate', 'releaseDate', 'releaseNotes', 'position', 'status']) {
    if (key in changes) updates[key] = changes[key];
  }
  if (updates.status === 'released' && version.status !== 'released') {
    updates.releasedAt = version.releasedAt ?? new Date();
    if (!updates.releaseDate && !version.releaseDate) {
      updates.releaseDate = new Date().toISOString().slice(0, 10);
    }
  }
  if (updates.status === 'unreleased') {
    updates.releasedAt = null;
  }
  await version.update(updates);
  const stats = await statsForVersions([versionId]);
  return toSummary(version, stats.get(versionId));
}

export async function releaseVersion(projectId, versionId, { generateNotes = true } = {}) {
  const version = await findVersion(projectId, versionId);
  if (version.status === 'archived') throw ApiError.badRequest('Archived versions cannot be released — reopen them first');
  const updates = {
    status: 'released',
    releasedAt: version.releasedAt ?? new Date(),
    releaseDate: version.releaseDate ?? new Date().toISOString().slice(0, 10),
  };
  if (generateNotes && !(version.releaseNotes && version.releaseNotes.trim())) {
    const issues = await loadFixIssues(versionId);
    updates.releaseNotes = buildReleaseNotesMarkdown(
      { name: version.name, releaseDate: updates.releaseDate, releasedAt: updates.releasedAt },
      issues,
    );
  }
  await version.update(updates);
  return getVersion(projectId, versionId);
}

export async function archiveVersion(projectId, versionId) {
  const version = await findVersion(projectId, versionId);
  await version.update({ status: 'archived' });
  const stats = await statsForVersions([versionId]);
  return toSummary(version, stats.get(versionId));
}

export async function reopenVersion(projectId, versionId) {
  const version = await findVersion(projectId, versionId);
  await version.update({ status: 'unreleased', releasedAt: null });
  const stats = await statsForVersions([versionId]);
  return toSummary(version, stats.get(versionId));
}

export async function generateReleaseNotes(projectId, versionId, { overwrite = true } = {}) {
  const version = await findVersion(projectId, versionId);
  if (!overwrite && version.releaseNotes?.trim()) {
    return getVersion(projectId, versionId);
  }
  const issues = await loadFixIssues(versionId);
  const markdown = buildReleaseNotesMarkdown(version, issues);
  await version.update({ releaseNotes: markdown });
  return getVersion(projectId, versionId);
}

export async function deleteVersion(projectId, versionId) {
  const version = await findVersion(projectId, versionId);
  await IssueFixVersion.destroy({ where: { versionId } });
  await IssueAffectedVersion.destroy({ where: { versionId } });
  await version.destroy();
}

/** Public summary used on issue payloads. */
export function versionPublicFields(version) {
  if (!version) return null;
  const json = typeof version.toJSON === 'function' ? version.toJSON() : version;
  return {
    id: json.id,
    name: json.name,
    status: json.status,
    releaseDate: json.releaseDate ?? null,
  };
}
