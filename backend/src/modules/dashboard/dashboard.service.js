import { Issue, Sprint, Status } from '../../database/models.js';
import { addDays, toDateOnly } from '../../shared/utils/query.js';
import { listProjectsActivity } from '../activity/activity.service.js';
import { listMyWork } from '../issues/issue.service.js';
import { getMemberProjectIds } from '../projects/project-access.js';
import { listProjects } from '../projects/project.service.js';

async function activeSprintProgress(projectIds) {
  const sprints = await Sprint.findAll({ where: { projectId: projectIds, state: 'active' } });
  if (!sprints.length) return [];
  const issues = await Issue.findAll({
    where: { sprintId: sprints.map((sprint) => sprint.id) },
    attributes: ['sprintId', 'storyPoints'],
    include: [{ model: Status, as: 'status', attributes: ['category'] }],
  });
  return sprints.map((sprint) => {
    const sprintIssues = issues.filter((issue) => issue.sprintId === sprint.id);
    const done = sprintIssues.filter((issue) => issue.status.category === 'done');
    return {
      ...sprint.toJSON(),
      issueCount: sprintIssues.length,
      doneCount: done.length,
      totalPoints: sprintIssues.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
      donePoints: done.reduce((total, issue) => total + (issue.storyPoints ?? 0), 0),
    };
  });
}

export async function getDashboard(userId) {
  const projectIds = await getMemberProjectIds(userId);
  const [myWork, projects, recentActivity, sprints] = await Promise.all([
    listMyWork(userId),
    listProjects(userId, { includeArchived: false }),
    listProjectsActivity(projectIds, 20),
    activeSprintProgress(projectIds),
  ]);

  const today = toDateOnly(new Date());
  const weekEnd = toDateOnly(addDays(new Date(), 7));
  const weekAgo = addDays(new Date(), -7);
  const open = myWork.filter((issue) => issue.status.category !== 'done');

  return {
    stats: {
      open: open.length,
      inProgress: open.filter((issue) => issue.status.category === 'in_progress').length,
      overdue: open.filter((issue) => issue.dueDate && issue.dueDate < today).length,
      dueToday: open.filter((issue) => issue.dueDate === today).length,
      dueThisWeek: open.filter((issue) => issue.dueDate && issue.dueDate >= today && issue.dueDate <= weekEnd).length,
      completedThisWeek: myWork.filter((issue) => issue.completedAt && new Date(issue.completedAt) >= weekAgo).length,
    },
    myWork,
    projects,
    activeSprints: sprints.map((sprint) => ({ ...sprint, project: projects.find((project) => project.id === sprint.projectId) ?? null })),
    recentActivity,
  };
}
