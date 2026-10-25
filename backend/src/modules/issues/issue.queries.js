import { Attachment, Comment, Issue, Label, Project, Sprint, Status, User } from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';

export const STATUS_SUMMARY_ATTRIBUTES = ['id', 'name', 'category', 'color'];
export const ISSUE_REFERENCE_ATTRIBUTES = ['id', 'key', 'title', 'type', 'priority'];

export const issueListInclude = () => [
  { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES },
  { model: Label, as: 'labels', attributes: ['id', 'name', 'color'], through: { attributes: [] } },
  { model: Issue, as: 'parent', attributes: ISSUE_REFERENCE_ATTRIBUTES },
  { model: Sprint, as: 'sprint', attributes: ['id', 'name', 'state'] },
  { model: Project, as: 'project', attributes: ['id', 'key', 'name', 'color'] },
];

export const issueDetailInclude = () => [
  ...issueListInclude(),
  { model: User, as: 'reporter', attributes: USER_SUMMARY_ATTRIBUTES },
  { model: User, as: 'watchers', attributes: USER_SUMMARY_ATTRIBUTES, through: { attributes: [] } },
];

/** Include used for domain events, so listeners can evaluate status category and labels. */
export const issueEventInclude = () => [
  { model: Status, as: 'status', attributes: STATUS_SUMMARY_ATTRIBUTES },
  { model: Label, as: 'labels', attributes: ['id', 'name'], through: { attributes: [] } },
];

const countBy = (rows, key) =>
  rows.reduce((counts, row) => counts.set(row[key], (counts.get(row[key]) ?? 0) + 1), new Map());

/** Adds sub-task progress and collaboration counters used by cards and list rows. */
export async function decorateIssues(issues) {
  if (!issues.length) return [];
  const ids = issues.map((issue) => issue.id);

  const [subtasks, comments, attachments] = await Promise.all([
    Issue.findAll({
      where: { parentId: ids },
      attributes: ['parentId'],
      include: [{ model: Status, as: 'status', attributes: ['category'] }],
    }),
    Comment.findAll({ where: { issueId: ids }, attributes: ['issueId'], raw: true }),
    Attachment.findAll({ where: { issueId: ids }, attributes: ['issueId'], raw: true }),
  ]);

  const progress = new Map();
  subtasks.forEach((subtask) => {
    const entry = progress.get(subtask.parentId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (subtask.status?.category === 'done') entry.done += 1;
    progress.set(subtask.parentId, entry);
  });
  const commentCounts = countBy(comments, 'issueId');
  const attachmentCounts = countBy(attachments, 'issueId');

  return issues.map((issue) => {
    const json = typeof issue.toJSON === 'function' ? issue.toJSON() : issue;
    return {
      ...json,
      subtaskProgress: progress.get(json.id) ?? { total: 0, done: 0 },
      commentCount: commentCounts.get(json.id) ?? 0,
      attachmentCount: attachmentCounts.get(json.id) ?? 0,
    };
  });
}
