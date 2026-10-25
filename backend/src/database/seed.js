import bcrypt from 'bcryptjs';
import { addDays, toDateOnly } from '../shared/utils/query.js';
import { prepareDatabase } from './connection.js';
import {
  AutomationRule,
  Issue,
  IssueTemplate,
  Label,
  ProjectMember,
  RecurringTask,
  Sprint,
  Status,
  Organization,
  OrganizationMember,
  User,
  sequelize,
} from './models.js';
import { runWithContext } from '../shared/context/request-context.js';
import { createComment } from '../modules/comments/comment.service.js';
import { createIssue } from '../modules/issues/issue.service.js';
import { createProject } from '../modules/projects/project.service.js';
import { computeNextRunAt } from '../modules/recurring-tasks/recurring-task.schedule.js';

const DEMO_PASSWORD = 'Password123!';

const PEOPLE = [
  { name: 'Alex Morgan', email: 'alex@vector.dev', title: 'Engineering Manager', avatarColor: '#6366f1' },
  { name: 'Priya Shah', email: 'priya@vector.dev', title: 'Senior Frontend Engineer', avatarColor: '#ec4899' },
  { name: 'Diego Ramos', email: 'diego@vector.dev', title: 'Backend Engineer', avatarColor: '#f59e0b' },
  { name: 'Mei Chen', email: 'mei@vector.dev', title: 'Product Designer', avatarColor: '#10b981' },
];

const day = (offset) => toDateOnly(addDays(new Date(), offset));

async function seedUsers() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return Promise.all(
    PEOPLE.map((person) => User.create({ ...person, passwordHash })),
  );
}

async function statusMap(projectId) {
  const statuses = await Status.findAll({ where: { projectId } });
  return Object.fromEntries(statuses.map((status) => [status.name, status]));
}

async function labelMap(projectId) {
  const labels = await Label.findAll({ where: { projectId } });
  return Object.fromEntries(labels.map((label) => [label.name, label.id]));
}

async function markDone(issue, statuses, daysAgo) {
  await issue.update({ statusId: statuses.Done.id, completedAt: addDays(new Date(), -daysAgo) });
}

async function seedPlatformProject([alex, priya, diego, mei]) {
  const project = await createProject(alex, {
    name: 'Vector Platform',
    key: 'VEC',
    type: 'scrum',
    color: '#6366f1',
    description: 'Core product: web app, API and mobile experience.',
  });
  await ProjectMember.bulkCreate([
    { projectId: project.id, userId: priya.id, role: 'member' },
    { projectId: project.id, userId: diego.id, role: 'member' },
    { projectId: project.id, userId: mei.id, role: 'member' },
  ]);

  const statuses = await statusMap(project.id);
  const labels = await labelMap(project.id);

  for (const [index, summary] of [
    { totalPoints: 24, donePoints: 19, doneCount: 8, issueCount: 10 },
    { totalPoints: 26, donePoints: 23, doneCount: 9, issueCount: 10 },
  ].entries()) {
    await Sprint.create({
      projectId: project.id,
      name: `VEC Sprint 0.${index + 1}`,
      state: 'completed',
      startDate: day(-33 + index * 14),
      endDate: day(-19 + index * 14),
      completedAt: addDays(new Date(), -19 + index * 14),
      summary,
    });
  }

  const activeSprint = await Sprint.findOne({ where: { projectId: project.id, name: 'VEC Sprint 1' } });
  await activeSprint.update({ state: 'active', startDate: day(-5), endDate: day(9), goal: 'Ship the new onboarding flow and mobile task view' });
  const nextSprint = await Sprint.create({ projectId: project.id, name: 'VEC Sprint 2', goal: 'Reporting and automation polish' });

  const create = (input, actor = alex) => createIssue({ projectId: project.id, ...input }, actor);

  const epic = await create({ title: 'Self-serve onboarding', type: 'epic', priority: 'high', description: 'Let new teams sign up, invite colleagues and create their first project without help.' });
  const story = await create({
    title: 'As a new user I want a guided setup so that I can start in minutes',
    type: 'story',
    priority: 'high',
    parentId: epic.id,
    sprintId: activeSprint.id,
    assigneeId: priya.id,
    storyPoints: 5,
    dueDate: day(4),
    labelIds: [labels.frontend, labels.design],
    statusId: statuses['In Progress'].id,
    description: '## Acceptance criteria\n- [ ] Welcome screen explains the core concepts\n- [ ] Users can create a project from a template\n- [ ] Users can invite teammates by email',
    subtaskTitles: ['Design welcome screen', 'Build project template picker', 'Invite teammates step'],
  });
  const storySubtasks = await Issue.findAll({ where: { parentId: story.id }, order: [['number', 'ASC']] });
  await markDone(storySubtasks[0], statuses, 2);

  const issues = [
    { title: 'Login fails when email contains uppercase letters', type: 'bug', priority: 'highest', assigneeId: diego.id, sprintId: activeSprint.id, storyPoints: 2, dueDate: day(-1), labelIds: [labels.backend], statusId: statuses['In Review'].id },
    { title: 'Mobile: My Tasks view with quick complete', type: 'story', priority: 'high', assigneeId: priya.id, sprintId: activeSprint.id, storyPoints: 8, dueDate: day(6), labelIds: [labels.frontend] },
    { title: 'Add rate limiting to public endpoints', type: 'task', priority: 'medium', assigneeId: diego.id, sprintId: activeSprint.id, storyPoints: 3, labelIds: [labels.backend], statusId: statuses['In Progress'].id },
    { title: 'Design empty states for boards and inbox', type: 'task', priority: 'medium', assigneeId: mei.id, sprintId: activeSprint.id, storyPoints: 2, dueDate: day(0), labelIds: [labels.design] },
    { title: 'Email notifications for mentions', type: 'story', priority: 'medium', assigneeId: diego.id, sprintId: activeSprint.id, storyPoints: 5, labelIds: [labels.backend], done: 3 },
    { title: 'Keyboard shortcuts for board navigation', type: 'task', priority: 'low', assigneeId: priya.id, sprintId: activeSprint.id, storyPoints: 3, labelIds: [labels.frontend], done: 1 },
    { title: 'Burndown chart for active sprint', type: 'story', priority: 'medium', sprintId: nextSprint.id, storyPoints: 5, labelIds: [labels.frontend] },
    { title: 'Remove legacy session tables', type: 'task', priority: 'low', sprintId: nextSprint.id, storyPoints: 2, labelIds: [labels['tech-debt'], labels.backend] },
    { title: 'Avatar upload crops images incorrectly', type: 'bug', priority: 'high', assigneeId: mei.id, dueDate: day(2), labelIds: [labels.frontend] },
    { title: 'Explore offline support for the PWA', type: 'task', priority: 'lowest' },
    { title: 'Document the automation rules API', type: 'task', priority: 'low', assigneeId: alex.id, dueDate: day(10) },
  ];

  const created = {};
  for (const { done, ...input } of issues) {
    const issue = await create(input);
    if (done) await markDone(issue, statuses, done);
    created[input.title] = issue;
  }

  const loginBug = created['Login fails when email contains uppercase letters'];
  await createComment(loginBug, priya, 'I can reproduce this with `Alex@Vector.dev`. Looks like we compare emails case-sensitively.');
  await createComment(loginBug, diego, `Fix is up for review. @[Alex Morgan](${alex.id}) can you take a look?`);
  await createComment(story, mei, 'Final designs for the welcome screen are attached in Figma.');

  const doneStatus = statuses.Done;
  await AutomationRule.bulkCreate([
    {
      projectId: project.id,
      name: 'Triage urgent bugs',
      description: 'Urgent bugs go straight into the active sprint and admins are alerted.',
      trigger: 'issue.created',
      conditions: [
        { field: 'type', operator: 'equals', value: 'bug' },
        { field: 'priority', operator: 'in', value: ['high', 'highest'] },
      ],
      actions: [
        { type: 'move_to_active_sprint', params: {} },
        { type: 'assign', params: { strategy: 'least_loaded' } },
        { type: 'notify', params: { recipients: ['project_admins'], userIds: [], message: 'Urgent bug {{issue.key}} was triaged automatically.' } },
      ],
      createdById: alex.id,
    },
    {
      projectId: project.id,
      name: 'Let the reporter know when work is done',
      trigger: 'issue.status_changed',
      conditions: [{ field: 'statusId', operator: 'equals', value: doneStatus.id }],
      actions: [{ type: 'notify', params: { recipients: ['reporter'], userIds: [], message: '{{issue.key}} "{{issue.title}}" is done.' } }],
      createdById: alex.id,
    },
    {
      projectId: project.id,
      name: 'Start work when an issue is assigned',
      enabled: false,
      trigger: 'issue.assigned',
      conditions: [
        { field: 'statusCategory', operator: 'equals', value: 'todo' },
        { field: 'assigneeId', operator: 'is_not_empty' },
      ],
      actions: [{ type: 'set_status', params: { statusId: statuses['In Progress'].id } }],
      createdById: alex.id,
    },
  ]);

  await IssueTemplate.bulkCreate([
    {
      projectId: project.id,
      name: 'Bug report',
      issueType: 'bug',
      titlePrefix: '[Bug]',
      priority: 'high',
      body: '## Steps to reproduce\n1. \n2. \n\n## Expected result\n\n## Actual result\n\n## Environment\n- Browser / device:\n- Version:',
      labelIds: [],
      subtaskTitles: ['Reproduce', 'Fix', 'Add regression test'],
      createdById: alex.id,
    },
    {
      projectId: project.id,
      name: 'Feature request',
      issueType: 'story',
      priority: 'medium',
      storyPoints: 5,
      body: '## Problem\n\n## Proposed solution\n\n## Acceptance criteria\n- [ ] \n- [ ] ',
      labelIds: [],
      subtaskTitles: ['Design', 'Implement', 'Test', 'Document'],
      createdById: alex.id,
    },
  ]);

  const weekly = { frequency: 'weekly', dayOfWeek: 1, timeOfDay: '09:00' };
  await RecurringTask.create({
    projectId: project.id,
    title: 'Update dependencies and review security advisories',
    issueType: 'task',
    priority: 'medium',
    assigneeId: diego.id,
    dueInDays: 2,
    ...weekly,
    nextRunAt: computeNextRunAt(weekly),
    createdById: alex.id,
  });

  return project;
}

async function seedMarketingProject([alex, priya, , mei]) {
  const project = await createProject(mei, { name: 'Marketing Ops', key: 'MKT', type: 'kanban', color: '#10b981', description: 'Campaigns, content and launches.' });
  await ProjectMember.bulkCreate([
    { projectId: project.id, userId: alex.id, role: 'member' },
    { projectId: project.id, userId: priya.id, role: 'viewer' },
  ]);
  const statuses = await statusMap(project.id);
  const create = (input) => createIssue({ projectId: project.id, ...input }, mei);

  await create({ title: 'Launch blog post for v2.0', priority: 'high', assigneeId: mei.id, dueDate: day(3), statusId: statuses['In Progress'].id });
  await create({ title: 'Prepare webinar slides', priority: 'medium', assigneeId: alex.id, dueDate: day(8) });
  await create({ title: 'Refresh pricing page screenshots', priority: 'low', assigneeId: mei.id });
  const done = await create({ title: 'Customer newsletter — October', priority: 'medium', assigneeId: mei.id });
  await markDone(done, statuses, 4);
}

/** Spreads creation dates over the past weeks so reports and timelines look like a real project. */
async function backdateHistory() {
  const issues = await Issue.findAll({ attributes: ['id', 'number', 'completedAt'] });
  for (const issue of issues) {
    const createdAt = issue.completedAt
      ? addDays(issue.completedAt, -(2 + (issue.number % 4)))
      : addDays(new Date(), -(1 + (issue.number % 12)));
    await sequelize.query('UPDATE issues SET created_at = :createdAt WHERE id = :id', {
      replacements: { createdAt, id: issue.id },
    });
  }
}

try {
  await prepareDatabase();
  await sequelize.sync({ force: true });
  const users = await seedUsers();
  const organization = await Organization.create({ name: 'Vector', slug: 'vector-demo', createdById: users[0].id });
  await OrganizationMember.bulkCreate(users.map((user, index) => ({ organizationId: organization.id, userId: user.id, role: index === 0 ? 'admin' : 'member' })));
  await User.update({ lastOrganizationId: organization.id }, { where: {} });
  await runWithContext({ organizationId: organization.id, organizationRole: 'admin' }, async () => {
    await seedPlatformProject(users);
    await seedMarketingProject(users);
  });
  await backdateHistory();
  console.log('[seed] demo data created');
  console.log(`[seed] sign in with ${PEOPLE[0].email} / ${DEMO_PASSWORD} (organization admin of "${organization.name}" at /${organization.slug}; also priya@, diego@, mei@)`);
  process.exit(0);
} catch (error) {
  console.error('[seed] failed', error);
  process.exit(1);
}
