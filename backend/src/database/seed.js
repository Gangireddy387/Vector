import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { config } from '../config/index.js';
import { addDays, toDateOnly } from '../shared/utils/query.js';
import { prepareDatabase } from './connection.js';
import {
  Attachment,
  AutomationRule,
  ChatMessage,
  ChatMessageIssue,
  Department,
  Issue,
  IssueLink,
  IssueTemplate,
  IssueWatcher,
  Label,
  Notification,
  Organization,
  OrganizationMember,
  ProjectMember,
  RecurringTask,
  SavedFilter,
  Sprint,
  StandupUpdate,
  Status,
  Team,
  TeamMember,
  User,
  WorkLog,
  sequelize,
} from './models.js';
import { runWithContext } from '../shared/context/request-context.js';
import { createComment } from '../modules/comments/comment.service.js';
import { createIssue } from '../modules/issues/issue.service.js';
import { createProject } from '../modules/projects/project.service.js';
import { computeNextRunAt } from '../modules/recurring-tasks/recurring-task.schedule.js';
import { ensureDefaultPlans, getDefaultPlan } from '../modules/plans/plan.service.js';
import { ensureSuperAdmin } from '../modules/super-admin/super-admin.service.js';

/**
 * Demo data for Northwind Labs: five departments with teams, seven team-owned projects and tasks in every state,
 * so every screen (boards, sprints, reports, automation, chat, standups, inbox, super admin) has something to show.
 * Resets the whole database.
 */
const DEMO_PASSWORD = 'Password123!';

const PEOPLE = {
  alex: { name: 'Alex Morgan', email: 'alex@northwind.dev', title: 'Chief Executive Officer', avatarColor: '#6366f1' },
  priya: { name: 'Priya Shah', email: 'priya@northwind.dev', title: 'Head of Engineering', avatarColor: '#ec4899' },
  diego: { name: 'Diego Ramos', email: 'diego@northwind.dev', title: 'Senior Backend Engineer', avatarColor: '#f59e0b' },
  mei: { name: 'Mei Chen', email: 'mei@northwind.dev', title: 'Head of Product & Design', avatarColor: '#10b981' },
  sam: { name: 'Sam Okafor', email: 'sam@northwind.dev', title: 'Frontend Engineer', avatarColor: '#0ea5e9' },
  lena: { name: 'Lena Fischer', email: 'lena@northwind.dev', title: 'QA Engineer', avatarColor: '#8b5cf6' },
  tom: { name: 'Tom Becker', email: 'tom@northwind.dev', title: 'Marketing Manager', avatarColor: '#ef4444' },
  ravi: { name: 'Ravi Kumar', email: 'ravi@northwind.dev', title: 'Head of People', avatarColor: '#14b8a6' },
  aisha: { name: 'Aisha Khan', email: 'aisha@northwind.dev', title: 'Talent Recruiter', avatarColor: '#d946ef' },
  sofia: { name: 'Sofia Rossi', email: 'sofia@northwind.dev', title: 'Finance Lead', avatarColor: '#f97316' },
  james: { name: 'James Park', email: 'james@northwind.dev', title: 'Accountant', avatarColor: '#64748b' },
};

const day = (offset) => toDateOnly(addDays(new Date(), offset));
const ago = (days) => addDays(new Date(), -days);
/** The last weekday before today, which the standup page shows as "previous". */
const previousWorkday = () => {
  let offset = -1;
  while ([0, 6].includes(addDays(new Date(), offset).getDay())) offset -= 1;
  return day(offset);
};

// --- People & organizations ----------------------------------------------------------------

async function seedPeople() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const entries = await Promise.all(Object.entries(PEOPLE).map(async ([key, person]) => [key, await User.create({ ...person, passwordHash })]));
  return Object.fromEntries(entries);
}

/** Organizations other than Northwind, so the super admin has something to review. */
async function seedOtherOrganizations() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const defaultPlan = await getDefaultPlan();
  const nina = await User.create({ name: 'Nina Patel', email: 'nina@contoso.dev', title: 'Operations Director', avatarColor: '#22c55e', passwordHash });
  const contoso = await Organization.create({ name: 'Contoso Retail', slug: 'contoso-retail', status: 'pending', planId: defaultPlan?.id, createdById: nina.id });
  await OrganizationMember.create({ organizationId: contoso.id, userId: nina.id, role: 'admin' });
  await nina.update({ lastOrganizationId: contoso.id });

  const max = await User.create({ name: 'Max Turner', email: 'max@quickcash.dev', avatarColor: '#a855f7', passwordHash });
  const quickcash = await Organization.create({
    name: 'QuickCash Deals',
    slug: 'quickcash-deals',
    status: 'rejected',
    rejectionReason: 'We could not verify this company. Reply to the email with your registration details to apply again.',
    reviewedAt: ago(1),
    planId: defaultPlan?.id,
    createdById: max.id,
  });
  await OrganizationMember.create({ organizationId: quickcash.id, userId: max.id, role: 'admin' });
  await max.update({ lastOrganizationId: quickcash.id });
}

// --- Structure: departments → teams → members ------------------------------------------------

async function seedStructure(organizationId, p) {
  const department = (name, description, head) => Department.create({ organizationId, name, description, headId: head.id });
  const team = async (dept, name, description, lead, members) => {
    const created = await Team.create({ organizationId, departmentId: dept.id, name, description, leadId: lead.id });
    await TeamMember.bulkCreate([...new Set([lead, ...members])].map((user) => ({ teamId: created.id, userId: user.id })));
    return created;
  };

  const engineering = await department('Engineering', 'Builds and runs the Northwind app, its API and infrastructure.', p.priya);
  const product = await department('Product & Design', 'Decides what we build next, researches users and designs the experience.', p.mei);
  const marketing = await department('Marketing', 'Brand, campaigns, content and growth.', p.tom);
  const hr = await department('Human Resources', 'Hiring, onboarding and everything that helps people do their best work.', p.ravi);
  const finance = await department('Finance', 'Accounting, payroll, budgets and reporting.', p.sofia);

  return {
    frontend: await team(engineering, 'Frontend', 'Web and mobile app experience.', p.sam, [p.priya, p.lena]),
    backend: await team(engineering, 'Backend', 'APIs, data and integrations.', p.diego, [p.lena]),
    design: await team(product, 'UX Design', 'Research, wireframes, prototypes and usability testing.', p.mei, [p.sam]),
    growth: await team(marketing, 'Content & Growth', 'Campaigns, social media, newsletters and the blog.', p.tom, [p.mei]),
    recruitment: await team(hr, 'Recruitment', 'Finding and hiring great people.', p.aisha, [p.ravi]),
    peopleOps: await team(hr, 'People Operations', 'Onboarding, policies and employee experience.', p.ravi, [p.aisha]),
    accounts: await team(finance, 'Accounts', 'Bookkeeping, invoices, payroll and month-end close.', p.james, [p.sofia]),
  };
}

// --- Project helpers ------------------------------------------------------------------------

async function statusMap(projectId) {
  const statuses = await Status.findAll({ where: { projectId } });
  const byName = Object.fromEntries(statuses.map((status) => [status.name, status]));
  return { todo: byName['To Do'], progress: byName['In Progress'], review: byName['In Review'], done: byName.Done };
}

/** Projects start with software labels; business teams get labels that fit their work. */
async function setLabels(projectId, labels) {
  await Label.destroy({ where: { projectId } });
  const created = await Label.bulkCreate(labels.map(([name, color]) => ({ projectId, name, color })));
  return Object.fromEntries(created.map((label) => [label.name, label.id]));
}

async function labelMap(projectId) {
  const labels = await Label.findAll({ where: { projectId } });
  return Object.fromEntries(labels.map((label) => [label.name, label.id]));
}

async function addMembers(project, entries) {
  await ProjectMember.bulkCreate(entries.map(([user, role]) => ({ projectId: project.id, userId: user.id, role })));
}

/**
 * Creates tasks from a compact list. `state` is todo | progress | review | done; `doneAgo` is how many days ago a done
 * task was finished. Returns the tasks by title.
 */
async function createTasks(project, actor, statuses, list) {
  const created = {};
  for (const { state = 'todo', doneAgo = 2, ...input } of list) {
    const task = await createIssue({ projectId: project.id, ...input, statusId: statuses[state === 'done' ? 'todo' : state].id }, actor);
    if (state === 'done') await task.update({ statusId: statuses.done.id, completedAt: ago(doneAgo) });
    created[input.title] = task;
  }
  return created;
}

const markDone = (task, statuses, daysAgo) => task.update({ statusId: statuses.done.id, completedAt: ago(daysAgo) });

/** A small text file attached to a task, stored the same way as uploads. */
async function attachFile(task, uploader, fileName, content) {
  const folder = path.join(config.uploads.dir, new Date().toISOString().slice(0, 7));
  fs.mkdirSync(folder, { recursive: true });
  const storedName = `${crypto.randomUUID()}${path.extname(fileName)}`;
  const buffer = Buffer.from(content, 'utf8');
  fs.writeFileSync(path.join(folder, storedName), buffer);
  await Attachment.create({
    issueId: task.id,
    uploaderId: uploader.id,
    fileName,
    mimeType: 'text/markdown',
    size: buffer.length,
    storageKey: path.relative(config.uploads.dir, path.join(folder, storedName)).split(path.sep).join('/'),
  });
}

// --- Engineering: Northwind App (scrum, Frontend team) --------------------------------------

async function seedNorthwindApp(p, teams) {
  const project = await createProject(p.priya, {
    name: 'Northwind App',
    key: 'NWA',
    type: 'scrum',
    color: '#6366f1',
    description: 'Our customer app on web and mobile: onboarding, ordering and account management.',
    teamId: teams.frontend.id,
  });
  await addMembers(project, [
    [p.sam, 'member'],
    [p.diego, 'member'],
    [p.lena, 'member'],
    [p.mei, 'member'],
    [p.alex, 'viewer'],
  ]);
  const statuses = await statusMap(project.id);
  const labels = await labelMap(project.id);

  // Two finished sprints feed velocity and sprint history (closed after their tasks are added); the third is running, the fourth is planned.
  const sprint1 = await Sprint.create({ projectId: project.id, name: 'NWA Sprint 1', goal: 'Account basics', startDate: day(-33), endDate: day(-19) });
  const sprint2 = await Sprint.create({ projectId: project.id, name: 'NWA Sprint 2', goal: 'Ordering flow', startDate: day(-19), endDate: day(-5) });
  const active = await Sprint.findOne({ where: { projectId: project.id } , order: [['createdAt', 'ASC']] });
  await active.update({ name: 'NWA Sprint 3', state: 'active', startDate: day(-5), endDate: day(9), goal: 'Ship guided onboarding and the mobile task view' });
  const next = await Sprint.create({ projectId: project.id, name: 'NWA Sprint 4', goal: 'Payments and notifications polish' });

  const make = (input, actor = p.priya) => createIssue({ projectId: project.id, ...input }, actor);

  const onboarding = await make({ title: 'Guided onboarding', type: 'epic', priority: 'high', description: 'New customers sign up, verify their email and place a first order without help.' });
  const payments = await make({ title: 'Payments & checkout', type: 'epic', priority: 'highest', description: 'Card, wallet and invoice payments with saved methods.' });

  const welcome = await make({
    title: 'As a new customer I want a guided setup so that I can order in minutes',
    type: 'story', priority: 'high', parentId: onboarding.id, sprintId: active.id, assigneeId: p.sam.id, storyPoints: 5, dueDate: day(4),
    labelIds: [labels.frontend, labels.design], statusId: statuses.progress.id,
    description: '## Acceptance criteria\n- [x] Welcome screen explains the three main steps\n- [ ] Address and payment can be added inline\n- [ ] Progress is saved if the customer leaves',
    subtaskTitles: ['Design welcome screen', 'Build address step', 'Build payment step'],
  });
  const welcomeSubtasks = await Issue.findAll({ where: { parentId: welcome.id }, order: [['number', 'ASC']] });
  await markDone(welcomeSubtasks[0], statuses, 2);
  await welcomeSubtasks[1].update({ statusId: statuses.progress.id, assigneeId: p.sam.id });

  const tasks = await createTasks(project, p.priya, statuses, [
    // Finished in earlier sprints (feeds reports)
    { title: 'Sign up with email and password', type: 'story', priority: 'high', sprintId: sprint1.id, assigneeId: p.sam.id, storyPoints: 5, labelIds: [labels.frontend], parentId: onboarding.id, state: 'done', doneAgo: 24 },
    { title: 'Password reset by email', type: 'story', priority: 'medium', sprintId: sprint1.id, assigneeId: p.diego.id, storyPoints: 3, labelIds: [labels.backend], state: 'done', doneAgo: 22 },
    { title: 'Profile page with avatar upload', type: 'task', priority: 'medium', sprintId: sprint1.id, assigneeId: p.sam.id, storyPoints: 3, labelIds: [labels.frontend], state: 'done', doneAgo: 20 },
    { title: 'Cart keeps items after sign in', type: 'bug', priority: 'high', sprintId: sprint2.id, assigneeId: p.diego.id, storyPoints: 2, labelIds: [labels.backend], state: 'done', doneAgo: 12 },
    { title: 'Order history list', type: 'story', priority: 'medium', sprintId: sprint2.id, assigneeId: p.sam.id, storyPoints: 5, labelIds: [labels.frontend], state: 'done', doneAgo: 9 },
    { title: 'Card payments with saved cards', type: 'story', priority: 'highest', sprintId: sprint2.id, assigneeId: p.diego.id, storyPoints: 8, labelIds: [labels.backend], parentId: payments.id, state: 'done', doneAgo: 6 },
    // Current sprint
    { title: 'Login fails when email contains uppercase letters', type: 'bug', priority: 'highest', sprintId: active.id, assigneeId: p.diego.id, storyPoints: 2, dueDate: day(-1), labelIds: [labels.backend], state: 'review' },
    { title: 'Mobile: My tasks view with quick complete', type: 'story', priority: 'high', sprintId: active.id, assigneeId: p.sam.id, storyPoints: 8, dueDate: day(6), labelIds: [labels.frontend], state: 'progress' },
    { title: 'Verify email address after sign up', type: 'task', priority: 'medium', sprintId: active.id, assigneeId: p.diego.id, storyPoints: 3, labelIds: [labels.backend], parentId: onboarding.id, state: 'progress' },
    { title: 'Design empty states for boards and inbox', type: 'task', priority: 'medium', sprintId: active.id, assigneeId: p.mei.id, storyPoints: 2, dueDate: day(0), labelIds: [labels.design] },
    { title: 'Regression test plan for onboarding', type: 'task', priority: 'medium', sprintId: active.id, assigneeId: p.lena.id, storyPoints: 3, dueDate: day(5), state: 'todo' },
    { title: 'Push notifications for order updates', type: 'story', priority: 'medium', sprintId: active.id, assigneeId: p.diego.id, storyPoints: 5, labelIds: [labels.backend], state: 'done', doneAgo: 2 },
    { title: 'Keyboard shortcuts on the order board', type: 'task', priority: 'low', sprintId: active.id, assigneeId: p.sam.id, storyPoints: 3, labelIds: [labels.frontend], state: 'done', doneAgo: 1 },
    // Planned and backlog
    { title: 'Apple Pay and Google Pay', type: 'story', priority: 'high', sprintId: next.id, storyPoints: 8, labelIds: [labels.frontend, labels.backend], parentId: payments.id },
    { title: 'Remove legacy session tables', type: 'task', priority: 'low', sprintId: next.id, storyPoints: 2, labelIds: [labels['tech-debt'], labels.backend] },
    { title: 'Avatar upload crops images incorrectly', type: 'bug', priority: 'high', assigneeId: p.sam.id, dueDate: day(2), labelIds: [labels.frontend] },
    { title: 'Explore offline mode for the mobile app', type: 'task', priority: 'lowest' },
    { title: 'Invoices as PDF in order history', type: 'story', priority: 'medium', storyPoints: 5, parentId: payments.id },
  ]);

  await sprint1.update({ state: 'completed', completedAt: ago(19), summary: { totalPoints: 21, donePoints: 18, doneCount: 6, issueCount: 7 } });
  await sprint2.update({ state: 'completed', completedAt: ago(5), summary: { totalPoints: 26, donePoints: 24, doneCount: 8, issueCount: 9 } });

  const loginBug = tasks['Login fails when email contains uppercase letters'];
  const myTasks = tasks['Mobile: My tasks view with quick complete'];
  const avatarBug = tasks['Avatar upload crops images incorrectly'];

  await createComment(loginBug, p.lena, 'Reproduced with `Alex@Northwind.dev`: the login compares emails case-sensitively.');
  await createComment(loginBug, p.diego, `Fix is up for review: emails are now lower-cased on sign up and login. @[Priya Shah](${p.priya.id}) can you take a look?`);
  await createComment(loginBug, p.priya, 'Looks good. Please add a test for existing mixed-case accounts before merging.');
  await createComment(welcome, p.mei, 'Final designs for the three steps are attached. The progress bar uses the brand gradient.');
  await createComment(myTasks, p.sam, 'Swipe to complete works on iOS and Android. Undo shows for five seconds.');

  await IssueLink.bulkCreate([
    { sourceIssueId: loginBug.id, targetIssueId: tasks['Verify email address after sign up'].id, type: 'blocks', createdById: p.diego.id },
    { sourceIssueId: avatarBug.id, targetIssueId: tasks['Profile page with avatar upload'].id, type: 'relates_to', createdById: p.sam.id },
  ]);
  await IssueWatcher.bulkCreate(
    [
      { issueId: loginBug.id, userId: p.alex.id },
      { issueId: payments.id, userId: p.alex.id },
      { issueId: welcome.id, userId: p.priya.id },
    ],
    { ignoreDuplicates: true },
  );
  await WorkLog.bulkCreate([
    { issueId: loginBug.id, userId: p.diego.id, minutes: 90, note: 'Investigated and wrote the fix', loggedAt: ago(2) },
    { issueId: loginBug.id, userId: p.lena.id, minutes: 30, note: 'Reproduced and verified', loggedAt: ago(1) },
    { issueId: welcome.id, userId: p.sam.id, minutes: 240, note: 'Welcome screen and address step', loggedAt: ago(1) },
    { issueId: myTasks.id, userId: p.sam.id, minutes: 180, note: 'Swipe gestures', loggedAt: ago(0) },
  ]);
  await attachFile(welcome, p.mei, 'onboarding-designs.md', '# Onboarding designs\n\n1. Welcome\n2. Address\n3. Payment\n\nFigma: https://figma.com/file/northwind-onboarding\n');

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
      createdById: p.priya.id,
      runCount: 3,
      lastRunAt: ago(1),
    },
    {
      projectId: project.id,
      name: 'Let the reporter know when a task is done',
      trigger: 'issue.status_changed',
      conditions: [{ field: 'statusId', operator: 'equals', value: statuses.done.id }],
      actions: [{ type: 'notify', params: { recipients: ['reporter'], userIds: [], message: '{{issue.key}} "{{issue.title}}" is done.' } }],
      createdById: p.priya.id,
      runCount: 9,
      lastRunAt: ago(1),
    },
    {
      projectId: project.id,
      name: 'Start work when a task is assigned',
      enabled: false,
      trigger: 'issue.assigned',
      conditions: [
        { field: 'statusCategory', operator: 'equals', value: 'todo' },
        { field: 'assigneeId', operator: 'is_not_empty' },
      ],
      actions: [{ type: 'set_status', params: { statusId: statuses.progress.id } }],
      createdById: p.priya.id,
    },
  ]);

  await IssueTemplate.bulkCreate([
    {
      projectId: project.id, name: 'Bug report', issueType: 'bug', titlePrefix: '[Bug]', priority: 'high',
      body: '## Steps to reproduce\n1. \n2. \n\n## Expected result\n\n## Actual result\n\n## Device / browser\n',
      labelIds: [], subtaskTitles: ['Reproduce', 'Fix', 'Add regression test'], createdById: p.priya.id,
    },
    {
      projectId: project.id, name: 'Feature request', issueType: 'story', priority: 'medium', storyPoints: 5,
      body: '## Problem\n\n## Proposed solution\n\n## Acceptance criteria\n- [ ] \n- [ ] ',
      labelIds: [], subtaskTitles: ['Design', 'Build', 'Test', 'Document'], createdById: p.priya.id,
    },
  ]);

  const weekly = { frequency: 'weekly', dayOfWeek: 1, timeOfDay: '09:00' };
  await RecurringTask.create({
    projectId: project.id, title: 'Update dependencies and review security advisories', issueType: 'task', priority: 'medium',
    assigneeId: p.diego.id, dueInDays: 2, ...weekly, nextRunAt: computeNextRunAt(weekly), createdById: p.priya.id,
  });

  // Team chat with a task mention, and today's and yesterday's standup.
  const messages = [
    { author: p.priya, body: 'Morning all! Sprint 3 goal: guided onboarding and the mobile task view.', hoursAgo: 26 },
    { author: p.lena, body: `${loginBug.key} is blocking email verification tests. Any update?`, hoursAgo: 20, issue: loginBug },
    { author: p.diego, body: `Fix for ${loginBug.key} is in review now.`, hoursAgo: 19, issue: loginBug },
    { author: p.sam, body: 'Mobile task view is ready for a first look on the staging app 🎉', hoursAgo: 3 },
  ];
  for (const message of messages) {
    const created = await ChatMessage.create({ projectId: project.id, authorId: message.author.id, kind: 'user', body: message.body });
    await sequelize.query('UPDATE chat_messages SET created_at = :at, updated_at = :at WHERE id = :id', {
      replacements: { at: new Date(Date.now() - message.hoursAgo * 3600000), id: created.id },
    });
    if (message.issue) await ChatMessageIssue.create({ messageId: created.id, issueId: message.issue.id });
  }

  await StandupUpdate.bulkCreate([
    { projectId: project.id, userId: p.sam.id, date: previousWorkday(), yesterday: 'Welcome screen design review.', today: 'Address step of the guided setup.', issueIds: [welcome.id] },
    { projectId: project.id, userId: p.sam.id, date: day(0), yesterday: 'Address step done.', today: 'Swipe-to-complete on the mobile task view.', issueIds: [myTasks.id] },
    { projectId: project.id, userId: p.diego.id, date: day(0), yesterday: `Fixed ${loginBug.key}.`, today: 'Email verification endpoint.', blockers: 'Waiting for review on the login fix.', issueIds: [loginBug.id] },
    { projectId: project.id, userId: p.lena.id, date: day(0), yesterday: 'Wrote onboarding test cases.', today: 'Regression run on staging.', issueIds: [] },
  ]);

  return { project, loginBug, welcome, myTasks };
}

// --- Engineering: Core API (kanban, Backend team) ---------------------------------------------

async function seedCoreApi(p, teams) {
  const project = await createProject(p.diego, { name: 'Core API', key: 'API', type: 'kanban', color: '#f97316', description: 'Public and internal APIs, data and integrations.', teamId: teams.backend.id });
  await addMembers(project, [[p.priya, 'admin'], [p.lena, 'member'], [p.sam, 'member']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['backend', '#f97316'], ['security', '#ef4444'], ['performance', '#eab308'], ['tech-debt', '#78716c']]);
  const tasks = await createTasks(project, p.diego, statuses, [
    { title: 'Rate limiting for public endpoints', type: 'task', priority: 'high', assigneeId: p.diego.id, labelIds: [labels.security], dueDate: day(3), state: 'progress' },
    { title: 'Orders endpoint is slow for large accounts', type: 'bug', priority: 'high', assigneeId: p.diego.id, labelIds: [labels.performance], state: 'review' },
    { title: 'API docs for the orders endpoints', type: 'task', priority: 'medium', assigneeId: p.lena.id, dueDate: day(7) },
    { title: 'Webhook retries with exponential backoff', type: 'story', priority: 'medium', labelIds: [labels.backend] },
    { title: 'Rotate database credentials', type: 'task', priority: 'highest', assigneeId: p.diego.id, labelIds: [labels.security], dueDate: day(-2) },
    { title: 'Health check endpoint', type: 'task', priority: 'low', assigneeId: p.diego.id, state: 'done', doneAgo: 10 },
    { title: 'Pagination for search results', type: 'story', priority: 'medium', assigneeId: p.sam.id, labelIds: [labels.performance], state: 'done', doneAgo: 4 },
  ]);
  await createComment(tasks['Orders endpoint is slow for large accounts'], p.lena, 'Accounts with more than 5,000 orders take 8 seconds. Added an index on created_at; down to 300 ms.');
}

// --- Product & Design: Website Redesign (UX Design team) -------------------------------------

async function seedWebsite(p, teams) {
  const project = await createProject(p.mei, { name: 'Website Redesign', key: 'WEB', type: 'kanban', color: '#ec4899', description: 'New marketing website: research, wireframes, visual design and launch.', teamId: teams.design.id });
  await addMembers(project, [[p.sam, 'member'], [p.tom, 'member']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['research', '#8b5cf6'], ['design', '#ec4899'], ['content', '#0ea5e9'], ['accessibility', '#22c55e']]);
  const tasks = await createTasks(project, p.mei, statuses, [
    { title: 'Interview five customers about the current site', type: 'task', priority: 'high', assigneeId: p.mei.id, labelIds: [labels.research], state: 'done', doneAgo: 12 },
    { title: 'Wireframes for home, pricing and contact pages', type: 'task', priority: 'high', assigneeId: p.mei.id, labelIds: [labels.design], state: 'done', doneAgo: 5 },
    { title: 'Visual design for the home page', type: 'task', priority: 'high', assigneeId: p.mei.id, labelIds: [labels.design], dueDate: day(2), state: 'review' },
    { title: 'Write copy for the pricing page', type: 'task', priority: 'medium', assigneeId: p.tom.id, labelIds: [labels.content], dueDate: day(6), state: 'progress' },
    { title: 'Accessibility audit (colour contrast, keyboard)', type: 'task', priority: 'medium', assigneeId: p.sam.id, labelIds: [labels.accessibility], dueDate: day(10) },
    { title: 'Build the new home page', type: 'story', priority: 'medium', assigneeId: p.sam.id, dueDate: day(14) },
  ]);
  await createComment(tasks['Visual design for the home page'], p.tom, 'Love the hero section. Could we add customer logos below it?');
}

// --- Marketing: Q4 Campaigns (Content & Growth team) ----------------------------------------

async function seedCampaigns(p, teams) {
  const project = await createProject(p.tom, { name: 'Q4 Campaigns', key: 'MKT', type: 'kanban', color: '#10b981', description: 'Product launch, newsletters, social media and events for Q4.', teamId: teams.growth.id });
  await addMembers(project, [[p.mei, 'member'], [p.alex, 'member']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['campaign', '#10b981'], ['content', '#0ea5e9'], ['social', '#d946ef'], ['events', '#f59e0b']]);
  const tasks = await createTasks(project, p.tom, statuses, [
    { title: 'Launch blog post for the new mobile app', type: 'task', priority: 'high', assigneeId: p.tom.id, labelIds: [labels.content], dueDate: day(3), state: 'progress' },
    { title: 'Product launch email to all customers', type: 'task', priority: 'high', assigneeId: p.tom.id, labelIds: [labels.campaign], dueDate: day(8) },
    { title: 'Social media calendar for November', type: 'task', priority: 'medium', assigneeId: p.mei.id, labelIds: [labels.social], state: 'review' },
    { title: 'Prepare webinar slides', type: 'task', priority: 'medium', assigneeId: p.alex.id, labelIds: [labels.events], dueDate: day(12) },
    { title: 'Customer newsletter — October', type: 'task', priority: 'medium', assigneeId: p.tom.id, labelIds: [labels.content], state: 'done', doneAgo: 4 },
    { title: 'Book a stand at the Retail Tech Expo', type: 'task', priority: 'low', assigneeId: p.tom.id, labelIds: [labels.events], dueDate: day(-3) },
  ]);
  await createComment(tasks['Prepare webinar slides'], p.tom, `@[Alex Morgan](${p.alex.id}) I've shared the outline. Can you cover the vision part?`);
  const monthly = { frequency: 'monthly', dayOfMonth: 1, timeOfDay: '10:00' };
  await RecurringTask.create({
    projectId: project.id, title: 'Monthly customer newsletter', issueType: 'task', priority: 'medium', assigneeId: p.tom.id,
    labelIds: [labels.content], dueInDays: 5, ...monthly, nextRunAt: computeNextRunAt(monthly), createdById: p.tom.id,
  });
}

// --- Human Resources: Hiring 2026 (Recruitment) and Employee Onboarding (People Operations) ---

async function seedHiring(p, teams) {
  const project = await createProject(p.aisha, { name: 'Hiring 2026', key: 'HIR', type: 'kanban', color: '#8b5cf6', description: 'Open roles, interviews and offers.', teamId: teams.recruitment.id });
  await addMembers(project, [[p.ravi, 'admin'], [p.priya, 'member'], [p.mei, 'member']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['engineering-role', '#6366f1'], ['design-role', '#ec4899'], ['interview', '#0ea5e9'], ['offer', '#22c55e']]);
  const tasks = await createTasks(project, p.aisha, statuses, [
    { title: 'Hire two frontend engineers', type: 'story', priority: 'high', assigneeId: p.aisha.id, labelIds: [labels['engineering-role']], dueDate: day(30), state: 'progress', subtaskTitles: ['Publish job post', 'Screen applicants', 'Technical interviews', 'Send offers'] },
    { title: 'Schedule technical interviews for this week', type: 'task', priority: 'high', assigneeId: p.priya.id, labelIds: [labels.interview], dueDate: day(1) },
    { title: 'Prepare offer letter for the product designer', type: 'task', priority: 'medium', assigneeId: p.ravi.id, labelIds: [labels.offer, labels['design-role']], state: 'review' },
    { title: 'Portfolio review: product designer candidates', type: 'task', priority: 'medium', assigneeId: p.mei.id, labelIds: [labels['design-role']], state: 'done', doneAgo: 3 },
    { title: 'Update the careers page', type: 'task', priority: 'low', assigneeId: p.aisha.id, dueDate: day(-4) },
  ]);
  await createComment(tasks['Schedule technical interviews for this week'], p.aisha, 'Three candidates confirmed for Thursday and Friday afternoon.');
  await IssueTemplate.create({
    projectId: project.id, name: 'New open role', issueType: 'story', priority: 'high',
    body: '## Role\n\n## Hiring manager\n\n## Must-have skills\n- \n\n## Salary range\n', labelIds: [],
    subtaskTitles: ['Publish job post', 'Screen applicants', 'Interviews', 'Reference checks', 'Send offer'], createdById: p.aisha.id,
  });
  const chat = await ChatMessage.create({ projectId: project.id, authorId: p.aisha.id, kind: 'user', body: 'We have 42 applicants for the frontend role so far. Screening starts Monday.' });
  void chat;
}

async function seedOnboarding(p, teams) {
  const project = await createProject(p.ravi, { name: 'Employee Onboarding', key: 'ONB', type: 'kanban', color: '#14b8a6', description: 'Getting new joiners set up: equipment, accounts and first-week plan.', teamId: teams.peopleOps.id });
  await addMembers(project, [[p.aisha, 'member'], [p.james, 'member']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['onboarding', '#14b8a6'], ['it-setup', '#0ea5e9'], ['policy', '#a855f7']]);
  await createTasks(project, p.ravi, statuses, [
    { title: 'Laptop and accounts for Lena (QA)', type: 'task', priority: 'high', assigneeId: p.ravi.id, labelIds: [labels['it-setup']], state: 'done', doneAgo: 14 },
    { title: 'First-week plan for the new frontend engineers', type: 'task', priority: 'medium', assigneeId: p.aisha.id, labelIds: [labels.onboarding], dueDate: day(9) },
    { title: 'Update the remote work policy', type: 'task', priority: 'medium', assigneeId: p.ravi.id, labelIds: [labels.policy], state: 'progress', dueDate: day(5) },
    { title: 'Add new joiners to payroll', type: 'task', priority: 'high', assigneeId: p.james.id, dueDate: day(2) },
  ]);
  const monthly = { frequency: 'monthly', dayOfMonth: 1, timeOfDay: '09:30' };
  await RecurringTask.create({
    projectId: project.id, title: 'Monthly new-joiner orientation', issueType: 'task', priority: 'medium', assigneeId: p.ravi.id,
    labelIds: [labels.onboarding], dueInDays: 3, ...monthly, nextRunAt: computeNextRunAt(monthly), createdById: p.ravi.id,
  });
}

// --- Finance: Month-end Close (Accounts team) -----------------------------------------------

async function seedFinance(p, teams) {
  const project = await createProject(p.sofia, { name: 'Month-end Close', key: 'FIN', type: 'kanban', color: '#0ea5e9', description: 'Bookkeeping, payroll, invoices and monthly reporting.', teamId: teams.accounts.id });
  await addMembers(project, [[p.james, 'member'], [p.alex, 'viewer']]);
  const statuses = await statusMap(project.id);
  const labels = await setLabels(project.id, [['payroll', '#f97316'], ['invoices', '#0ea5e9'], ['tax', '#ef4444'], ['reporting', '#22c55e']]);
  const tasks = await createTasks(project, p.sofia, statuses, [
    { title: 'Reconcile bank accounts for October', type: 'task', priority: 'high', assigneeId: p.james.id, labelIds: [labels.reporting], dueDate: day(2), state: 'progress' },
    { title: 'Run October payroll', type: 'task', priority: 'highest', assigneeId: p.james.id, labelIds: [labels.payroll], dueDate: day(4) },
    { title: 'Chase overdue customer invoices', type: 'task', priority: 'medium', assigneeId: p.james.id, labelIds: [labels.invoices], dueDate: day(-1) },
    { title: 'Quarterly VAT return', type: 'task', priority: 'high', assigneeId: p.sofia.id, labelIds: [labels.tax], dueDate: day(11) },
    { title: 'Q3 board report', type: 'task', priority: 'medium', assigneeId: p.sofia.id, labelIds: [labels.reporting], state: 'done', doneAgo: 8 },
  ]);
  await createComment(tasks['Run October payroll'], p.sofia, 'Remember the two new joiners from HR start on the 1st.');
  const monthly = { frequency: 'monthly', dayOfMonth: 25, timeOfDay: '09:00' };
  await RecurringTask.create({
    projectId: project.id, title: 'Monthly payroll run', issueType: 'task', priority: 'highest', assigneeId: p.james.id,
    labelIds: [labels.payroll], dueInDays: 3, ...monthly, nextRunAt: computeNextRunAt(monthly), createdById: p.sofia.id,
  });
  const weekly = { frequency: 'weekly', dayOfWeek: 5, timeOfDay: '15:00' };
  await RecurringTask.create({
    projectId: project.id, title: 'Weekly invoice review', issueType: 'task', priority: 'medium', assigneeId: p.james.id,
    labelIds: [labels.invoices], dueInDays: 1, ...weekly, nextRunAt: computeNextRunAt(weekly), createdById: p.sofia.id,
  });
}

// --- Inbox and saved filters --------------------------------------------------------------

async function seedInbox(p, app) {
  const link = (task) => `/issues/${task.key}`;
  await Notification.bulkCreate([
    { userId: p.priya.id, actorId: p.diego.id, projectId: app.project.id, issueId: app.loginBug.id, type: 'mentioned', title: `Diego Ramos mentioned you on ${app.loginBug.key}`, body: 'Fix is up for review…', link: link(app.loginBug) },
    { userId: p.priya.id, actorId: p.sam.id, projectId: app.project.id, issueId: app.myTasks.id, type: 'commented', title: `Sam Okafor commented on ${app.myTasks.key}`, body: 'Swipe to complete works on iOS and Android.', link: link(app.myTasks) },
    { userId: p.alex.id, actorId: p.priya.id, projectId: app.project.id, issueId: app.loginBug.id, type: 'status_changed', title: `${app.loginBug.key} moved to In Review`, body: `Priya Shah changed the status of "${app.loginBug.title}"`, link: link(app.loginBug) },
    { userId: p.sam.id, actorId: p.priya.id, projectId: app.project.id, issueId: app.welcome.id, type: 'assigned', title: `Priya Shah assigned you ${app.welcome.key}`, body: app.welcome.title, link: link(app.welcome), readAt: ago(1) },
    { userId: p.diego.id, actorId: null, projectId: app.project.id, issueId: app.loginBug.id, type: 'due_soon', title: `${app.loginBug.key} is overdue`, body: app.loginBug.title, link: link(app.loginBug) },
  ]);
  await SavedFilter.bulkCreate([
    { userId: p.priya.id, projectId: app.project.id, name: 'Urgent bugs', criteria: { type: 'bug', priority: 'highest' } },
    { userId: p.priya.id, projectId: null, name: 'Overdue everywhere', criteria: { overdue: 'true' } },
    { userId: p.sam.id, projectId: null, name: 'My tasks', criteria: { assigneeId: p.sam.id } },
  ]);
}

/** Spreads creation dates over the past weeks so reports and timelines look like real work. */
async function backdateHistory() {
  const tasks = await Issue.findAll({ attributes: ['id', 'number', 'completedAt'] });
  for (const task of tasks) {
    const createdAt = task.completedAt ? addDays(task.completedAt, -(2 + (task.number % 5))) : addDays(new Date(), -(1 + (task.number % 14)));
    await sequelize.query('UPDATE issues SET created_at = :createdAt WHERE id = :id', { replacements: { createdAt, id: task.id } });
  }
}

try {
  await prepareDatabase();
  await sequelize.sync({ force: true });
  const people = await seedPeople();
  const organization = await Organization.create({ name: 'Northwind Labs', slug: 'northwind', status: 'approved', createdById: people.alex.id });
  await OrganizationMember.bulkCreate(
    Object.entries(people).map(([key, user]) => ({ organizationId: organization.id, userId: user.id, role: ['alex', 'priya'].includes(key) ? 'admin' : 'member' })),
  );
  await User.update({ lastOrganizationId: organization.id }, { where: {} });
  await ensureDefaultPlans();
  await seedOtherOrganizations();

  const teams = await seedStructure(organization.id, people);
  let app;
  await runWithContext({ organizationId: organization.id, organizationRole: 'admin' }, async () => {
    app = await seedNorthwindApp(people, teams);
    await seedCoreApi(people, teams);
    await seedWebsite(people, teams);
    await seedCampaigns(people, teams);
    await seedHiring(people, teams);
    await seedOnboarding(people, teams);
    await seedFinance(people, teams);
  });
  await seedInbox(people, app);
  await backdateHistory();
  await ensureSuperAdmin();

  console.log('[seed] Northwind Labs demo data created');
  console.log(`[seed] sign in with ${PEOPLE.alex.email} / ${DEMO_PASSWORD} (organization admin)`);
  console.log('[seed] also: priya@ (Head of Engineering, admin), sam@ (Frontend lead), ravi@ (Head of People), sofia@ (Finance lead) — all @northwind.dev');
  console.log('[seed] super admin review: Contoso Retail (pending) and QuickCash Deals (rejected)');
  process.exit(0);
} catch (error) {
  console.error('[seed] failed', error);
  process.exit(1);
}
