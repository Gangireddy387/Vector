import { CalendarEvent, Issue, Project, Status } from '../../database/models.js';
import { projectHasFeature } from '../plans/plan.service.js';

/**
 * Keeps an all-day calendar entry on the assignee's calendar for a task's due date.
 * Removes the entry when the task has no due date, no assignee, or is done.
 * Requires the organization's plan to include calendar.
 */
export async function syncIssueDueToCalendar(issueId) {
  const issue = await Issue.findByPk(issueId, {
    attributes: ['id', 'key', 'title', 'dueDate', 'assigneeId', 'projectId', 'completedAt', 'statusId'],
    include: [
      { model: Project, as: 'project', attributes: ['id', 'organizationId', 'name', 'color'] },
      { model: Status, as: 'status', attributes: ['category'] },
    ],
  });
  if (!issue) return;

  const existing = await CalendarEvent.findAll({ where: { issueId: issue.id } });
  if (!(await projectHasFeature(issue.projectId, 'calendar'))) {
    if (existing.length) await CalendarEvent.destroy({ where: { issueId: issue.id } });
    return;
  }

  const done = issue.status?.category === 'done' || Boolean(issue.completedAt);
  const shouldHave = Boolean(issue.dueDate && issue.assigneeId && issue.project?.organizationId && !done);

  if (!shouldHave) {
    if (existing.length) await CalendarEvent.destroy({ where: { issueId: issue.id } });
    return;
  }

  const title = `${issue.key} · ${issue.title}`.slice(0, 160);
  const values = {
    organizationId: issue.project.organizationId,
    ownerId: issue.assigneeId,
    title,
    description: `Due date for ${issue.key} in ${issue.project.name}`,
    date: issue.dueDate,
    allDay: true,
    startTime: null,
    endTime: null,
    category: 'focus',
    location: null,
    projectId: issue.projectId,
    status: 'planned',
    completedAt: null,
    seriesId: null,
    meetingId: null,
    issueId: issue.id,
  };

  const mine = existing.filter((event) => event.ownerId === issue.assigneeId);
  const others = existing.filter((event) => event.ownerId !== issue.assigneeId);
  if (others.length) await CalendarEvent.destroy({ where: { id: others.map((event) => event.id) } });

  if (mine[0]) {
    await mine[0].update(values);
    if (mine.length > 1) await CalendarEvent.destroy({ where: { id: mine.slice(1).map((event) => event.id) } });
  } else {
    await CalendarEvent.create(values);
  }
}

export async function removeIssueCalendarEvents(issueId) {
  await CalendarEvent.destroy({ where: { issueId } });
}
