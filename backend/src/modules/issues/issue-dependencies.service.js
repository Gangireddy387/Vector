import { Issue, IssueLink, Status, User } from '../../database/models.js';
import { USER_SUMMARY_ATTRIBUTES } from '../users/user.model.js';
import { buildDependencyGraph } from './issue-dependencies.js';

/**
 * Project-wide blocks graph + critical path for the Dependencies view.
 * Cross-project block links are ignored (both ends must be in this project).
 */
export async function getProjectDependencies(projectId) {
  const [issues, links] = await Promise.all([
    Issue.findAll({
      where: { projectId },
      attributes: ['id', 'key', 'title', 'type', 'priority', 'estimateMinutes', 'storyPoints', 'statusId'],
      include: [
        { model: Status, as: 'status', attributes: ['id', 'name', 'category', 'color'] },
        { model: User, as: 'assignee', attributes: USER_SUMMARY_ATTRIBUTES },
      ],
      order: [['number', 'ASC']],
    }),
    IssueLink.findAll({
      where: { type: 'blocks' },
      attributes: ['id', 'sourceIssueId', 'targetIssueId', 'type'],
      include: [
        { model: Issue, as: 'sourceIssue', attributes: ['id', 'projectId'], required: true },
        { model: Issue, as: 'targetIssue', attributes: ['id', 'projectId'], required: true },
      ],
    }),
  ]);

  const projectIssueIds = new Set(issues.map((issue) => issue.id));
  const graph = buildDependencyGraph({
    issues: issues.map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      estimateMinutes: issue.estimateMinutes,
      storyPoints: issue.storyPoints,
      statusCategory: issue.status?.category ?? 'todo',
      statusName: issue.status?.name ?? null,
      assignee: issue.assignee ? issue.assignee.toJSON() : null,
    })),
    links: links
      .filter((link) => projectIssueIds.has(link.sourceIssueId) && projectIssueIds.has(link.targetIssueId))
      .map((link) => ({
        id: link.id,
        sourceIssueId: link.sourceIssueId,
        targetIssueId: link.targetIssueId,
        type: link.type,
      })),
  });

  return graph;
}
