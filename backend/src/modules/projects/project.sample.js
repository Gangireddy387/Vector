import { Label, Project, Sprint, Status } from '../../database/models.js';
import { currentOrganizationId } from '../../shared/context/request-context.js';
import { ApiError } from '../../shared/errors/api-error.js';
import { createComment } from '../comments/comment.service.js';
import { createIssue, createLink } from '../issues/issue.service.js';
import { startSprint } from '../sprints/sprint.service.js';
import { createProject, deleteProject, getProject } from './project.service.js';

export const SAMPLE_PROJECT_NAME = 'Sample: Website launch';

const day = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
};

/**
 * The sample work: a small website launch with something in every column, a few due dates (one overdue),
 * an epic with children, sub-tasks, a blocker link and comments — so board, backlog, Home and detail all look alive.
 */
const TASKS = [
  {
    title: 'Website launch',
    type: 'epic',
    status: 'In Progress',
    priority: 'high',
    labels: ['design'],
    points: null,
    sprint: true,
    mine: true,
    description:
      'Ship the new marketing site. Stories and tasks below hang off this epic — open it to see the breakdown.',
  },
  {
    title: 'Agree the launch goals and success metrics',
    type: 'story',
    status: 'Done',
    priority: 'high',
    labels: ['design'],
    points: 2,
    due: -6,
    sprint: true,
    epic: 'Website launch',
    description: 'Define what “successful launch” means so the team can say done with confidence.',
  },
  {
    title: 'Design the new homepage',
    type: 'story',
    status: 'Done',
    priority: 'high',
    labels: ['design'],
    points: 5,
    due: -3,
    sprint: true,
    epic: 'Website launch',
    description: 'Desktop and mobile mockups for hero, features and pricing teaser. Handed off to engineering.',
  },
  {
    title: 'Build the responsive navigation',
    type: 'task',
    status: 'In Review',
    priority: 'medium',
    labels: ['frontend'],
    points: 3,
    due: 1,
    sprint: true,
    epic: 'Website launch',
    description: 'Sticky header, mobile drawer, and keyboard focus order matching the design.',
  },
  {
    title: 'Set up the contact form backend',
    type: 'task',
    status: 'In Progress',
    priority: 'high',
    labels: ['backend'],
    points: 5,
    due: 2,
    sprint: true,
    mine: true,
    epic: 'Website launch',
    subtasks: ['Validate email and message fields', 'Send confirmation email', 'Add basic spam rate-limit'],
    description:
      'Messages from the contact form should reach the sales inbox and be stored for follow-up.\n\n- Validate email and message\n- Send a confirmation to the visitor\n- Rate-limit to stop spam',
  },
  {
    title: 'Write copy for the pricing page',
    type: 'task',
    status: 'In Progress',
    priority: 'medium',
    labels: ['design'],
    points: 2,
    due: 0,
    sprint: true,
    mine: true,
    epic: 'Website launch',
    description: 'Three plan tiers, FAQ blurbs, and a short CTA. Keep tone friendly and specific.',
  },
  {
    title: 'Hero image loads slowly on phones',
    type: 'bug',
    status: 'To Do',
    priority: 'highest',
    labels: ['frontend'],
    points: 1,
    due: -1,
    sprint: true,
    mine: true,
    epic: 'Website launch',
    blocks: 'Publish the launch announcement',
    description:
      'On 4G the homepage hero takes over 4 seconds. Serve a smaller WebP version below 768px and lazy-load the rest.',
  },
  {
    title: 'Add analytics and cookie consent',
    type: 'task',
    status: 'To Do',
    priority: 'medium',
    labels: ['frontend', 'backend'],
    points: 3,
    due: 5,
    sprint: true,
    epic: 'Website launch',
    description: 'Consent banner before non-essential cookies; wire page views once accepted.',
  },
  {
    title: 'Test on Safari, Chrome and Firefox',
    type: 'task',
    status: 'To Do',
    priority: 'low',
    labels: ['frontend'],
    points: 2,
    due: 8,
    sprint: true,
    description: 'Smoke-test nav, forms and pricing on the last two major versions of each browser.',
  },
  {
    title: 'Publish the launch announcement',
    type: 'task',
    status: 'To Do',
    priority: 'medium',
    labels: [],
    points: 1,
    due: 12,
    sprint: true,
    epic: 'Website launch',
    description: 'Blog post + social copy. Blocked until the hero performance bug is fixed.',
  },
  {
    title: 'Blog section with categories',
    type: 'story',
    status: 'To Do',
    priority: 'low',
    labels: ['frontend', 'backend'],
    points: 8,
    description: 'Backlog: category filter, RSS, and author bylines. Not in this sprint.',
  },
  {
    title: 'Replace the old image slider library',
    type: 'task',
    status: 'To Do',
    priority: 'lowest',
    labels: ['tech-debt'],
    points: 3,
    description: 'Backlog tech debt — swap the unmaintained carousel for a lighter one.',
  },
  {
    title: 'Customer stories page',
    type: 'story',
    status: 'To Do',
    priority: 'medium',
    labels: ['design'],
    points: 5,
    description: 'Backlog: three short case studies with logos and a quote.',
  },
];

const COMMENTS = {
  'Set up the contact form backend':
    'Sales wants these in the shared inbox first — database storage can follow in a follow-up task.',
  'Hero image loads slowly on phones':
    'Reproduced on a mid-range Android on 4G. Desktop is fine; prioritize the mobile WebP path.',
  'Build the responsive navigation': 'Looks good on phone — just confirming focus order before we merge.',
};

/** A project key that is free in this organization: DEMO, DEMO2, DEMO3… */
async function freeKey() {
  const organizationId = currentOrganizationId();
  for (let attempt = 1; attempt < 50; attempt += 1) {
    const key = attempt === 1 ? 'DEMO' : `DEMO${attempt}`;
    if (!(await Project.count({ where: { organizationId, key } }))) return key;
  }
  return `DEMO${Date.now().toString(36).slice(-4).toUpperCase()}`;
}

/**
 * Creates a ready-to-explore sample project for the signed-in person: a running sprint with work in every column,
 * an epic, sub-tasks, labels, due dates, a blocker link and comments. Ordinary project (plan limits apply).
 */
export async function createSampleProject(user) {
  const created = await createProject(user, {
    name: SAMPLE_PROJECT_NAME,
    key: await freeKey(),
    type: 'scrum',
    color: '#8b5cf6',
    description:
      'A sample project to explore Vector: a running sprint, board work in every column, an epic with children, sub-tasks, a blocker and comments. Keep it as a real project or wipe it from the banner.',
  });
  // Marked so the app can offer to delete it (with everything in it) in one click.
  const row = await Project.findByPk(created.id);
  await row.update({ settings: { ...row.settings, isSample: true } });

  const [statuses, labels, sprint] = await Promise.all([
    Status.findAll({ where: { projectId: created.id } }),
    Label.findAll({ where: { projectId: created.id } }),
    Sprint.findOne({ where: { projectId: created.id, state: 'planned' } }),
  ]);
  const statusId = (name) => statuses.find((status) => status.name === name)?.id;
  const labelIds = (names) => labels.filter((label) => names.includes(label.name)).map((label) => label.id);

  if (sprint) {
    await startSprint(
      created.id,
      sprint.id,
      { goal: 'Launch the new marketing website', startDate: day(-7), endDate: day(7) },
      user,
    );
  }

  /** @type {Map<string, { id: string, key: string }>} */
  const byTitle = new Map();

  for (const task of TASKS) {
    const issue = await createIssue(
      {
        projectId: created.id,
        title: task.title,
        description: task.description ?? null,
        type: task.type,
        priority: task.priority,
        statusId: statusId(task.status),
        labelIds: labelIds(task.labels),
        storyPoints: task.points,
        dueDate: task.due === undefined ? null : day(task.due),
        sprintId: task.sprint && sprint ? sprint.id : null,
        assigneeId: task.mine || (task.type !== 'epic' && task.status !== 'To Do') ? user.id : null,
        parentId: task.epic ? byTitle.get(task.epic)?.id ?? null : null,
        subtaskTitles: task.subtasks ?? [],
      },
      user,
      { source: 'system' },
    );
    byTitle.set(task.title, { id: issue.id, key: issue.key });

    const comment = COMMENTS[task.title];
    if (comment) await createComment(issue, user, comment, { source: 'system' });
  }

  for (const task of TASKS) {
    if (!task.blocks) continue;
    const source = byTitle.get(task.title);
    const target = byTitle.get(task.blocks);
    if (source && target) {
      await createLink({ id: source.id, projectId: created.id }, { targetIssue: target.key, type: 'blocks' }, user);
    }
  }

  return getProject(created.id, user.id);
}

/**
 * Turn a sample into a real project (keep the demo work) or wipe it entirely.
 * `keep` clears the sample flag and renames; `wipe` deletes the project and everything in it.
 */
export async function convertSampleProject(projectId, user, { mode = 'keep' } = {}) {
  const project = await Project.findByPk(projectId);
  if (!project) throw ApiError.notFound('Project not found');
  if (!project.settings?.isSample) throw ApiError.badRequest('This is not a sample project');

  if (mode === 'wipe') {
    await deleteProject(projectId);
    return { wiped: true, project: null };
  }

  const name = project.name.startsWith('Sample: ') ? project.name.slice('Sample: '.length).trim() || project.name : project.name;
  const { isSample: _removed, ...restSettings } = project.settings ?? {};
  await project.update({
    name,
    description: 'Your project — converted from the Vector sample. Rename it and invite your team.',
    settings: { ...restSettings, isSample: false },
  });
  return { wiped: false, project: await getProject(projectId, user.id) };
}
