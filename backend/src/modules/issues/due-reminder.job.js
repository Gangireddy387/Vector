import { Op } from 'sequelize';
import { Issue, Project, Status } from '../../database/models.js';
import { DomainEvents, eventBus } from '../../shared/events/event-bus.js';
import { toDateOnly } from '../../shared/utils/query.js';
import { issueEventInclude } from './issue.queries.js';

/** Publishes `issue.due_soon` once per due date for open issues inside each project's reminder window. */
export async function sendDueReminders() {
  const projects = await Project.findAll({ where: { archivedAt: null }, attributes: ['id', 'settings'] });
  let reminded = 0;

  for (const project of projects) {
    const windowHours = project.settings?.dueReminderHours ?? 24;
    const threshold = toDateOnly(new Date(Date.now() + windowHours * 60 * 60 * 1000));
    const doneStatusIds = (await Status.findAll({ where: { projectId: project.id, category: 'done' }, attributes: ['id'], raw: true }))
      .map((status) => status.id);

    const issues = await Issue.findAll({
      where: {
        projectId: project.id,
        dueDate: { [Op.ne]: null, [Op.lte]: threshold },
        dueReminderSentAt: null,
        statusId: { [Op.notIn]: doneStatusIds },
      },
      include: issueEventInclude(),
    });

    for (const issue of issues) {
      await issue.update({ dueReminderSentAt: new Date() });
      eventBus.publish(DomainEvents.ISSUE_DUE_SOON, { issue: issue.toJSON(), actorId: null, context: { source: 'system' } });
      reminded += 1;
    }
  }
  return reminded;
}
