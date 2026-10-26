/**
 * Exercises every issue flow end-to-end and checks the stored values, not only status codes.
 * Runs against a seeded API, works on throw-away issues in the VEC project and deletes them afterwards.
 * Usage: node scripts/issue-flows-test.js [baseUrl]
 */
const BASE_URL = process.argv[2] ?? 'http://localhost:4000/api';
let token = null;
let failures = 0;
const cleanup = [];

async function call(method, path, body, { raw = false } = {}) {
  const isForm = body instanceof FormData;
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  if (raw) return { status: response.status, response };
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
}

async function step(label, method, path, body, expectedStatus = 200) {
  const result = await call(method, path, body);
  const ok = result.status === expectedStatus;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(44)} ${method} ${path} -> ${result.status}${ok ? '' : ` ${JSON.stringify(result.data)}`}`);
  return result.data;
}

function expect(label, condition, detail = '') {
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${condition || !detail ? '' : ` — ${detail}`}`);
}

const detailOf = async (key) => (await call('GET', `/issues/${key}`)).data.issue;
const sameSet = (a, b) => a.length === b.length && a.every((item) => b.includes(item));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Setup ---------------------------------------------------------------
token = (await step('sign in as Alex', 'POST', '/auth/login', { email: 'alex@northwind.dev', password: 'Password123!' })).token;
const me = (await step('current user', 'GET', '/auth/me')).user;
const { projects } = await step('projects', 'GET', '/projects');
const project = (await step('project detail', 'GET', `/projects/${projects.find((item) => item.key === 'NWA').id}`)).project;
const [todo, inProgress, , done] = project.statuses;
const [labelA, labelB, labelC] = project.labels;
const priya = project.members.find((member) => member.email === 'priya@northwind.dev');
const { sprints } = await step('sprints', 'GET', `/projects/${project.id}/sprints`);
const activeSprint = sprints.find((sprint) => sprint.state === 'active');

// --- Create with every field ---------------------------------------------
const created = (
  await step('create issue with all fields', 'POST', '/issues', {
    projectId: project.id,
    title: 'Flow check: payroll export',
    type: 'story',
    priority: 'high',
    statusId: todo.id,
    description: 'Export **payroll** as CSV.',
    assigneeId: priya.id,
    sprintId: activeSprint?.id ?? null,
    dueDate: '2030-06-30',
    storyPoints: 5,
    labelIds: [labelA.id, labelB.id],
    subtaskTitles: ['Design CSV columns', 'Write exporter'],
  }, 201)
).issue;
cleanup.push(created.id);
let issue = await detailOf(created.key);
expect('created: title, type, priority', issue.title === 'Flow check: payroll export' && issue.type === 'story' && issue.priority === 'high');
expect('created: description', issue.description === 'Export **payroll** as CSV.');
expect('created: assignee', issue.assigneeId === priya.id, issue.assigneeId);
expect('created: sprint', !activeSprint || issue.sprintId === activeSprint.id);
expect('created: due date + points', issue.dueDate === '2030-06-30' && issue.storyPoints === 5, `${issue.dueDate} ${issue.storyPoints}`);
expect('created: two labels', sameSet(issue.labels.map((label) => label.id), [labelA.id, labelB.id]), issue.labels.map((l) => l.name).join());
expect('created: two sub-tasks', issue.subtasks.length === 2, `${issue.subtasks.length}`);
expect('created: reporter is me', issue.reporterId === me.id);

// --- Update each field ---------------------------------------------------
const updates = [
  ['title', { title: 'Flow check: payroll export v2' }, (i) => i.title === 'Flow check: payroll export v2'],
  ['description', { description: '- [ ] columns\n- [ ] totals' }, (i) => i.description === '- [ ] columns\n- [ ] totals'],
  ['type → task', { type: 'task' }, (i) => i.type === 'task'],
  ['priority → highest', { priority: 'highest' }, (i) => i.priority === 'highest'],
  ['status → in progress', { statusId: inProgress.id }, (i) => i.statusId === inProgress.id && !i.completedAt],
  ['assignee → me', { assigneeId: me.id }, (i) => i.assigneeId === me.id],
  ['assignee → unassigned', { assigneeId: null }, (i) => i.assigneeId === null],
  ['sprint → backlog', { sprintId: null }, (i) => i.sprintId === null],
  ['story points → 8', { storyPoints: 8 }, (i) => i.storyPoints === 8],
  ['story points → empty', { storyPoints: null }, (i) => i.storyPoints === null],
  ['estimate → 2h 30m', { estimateMinutes: 150 }, (i) => i.estimateMinutes === 150],
  ['start date', { startDate: '2030-06-01' }, (i) => i.startDate === '2030-06-01'],
  ['due date → cleared', { dueDate: null }, (i) => i.dueDate === null],
  ['labels → add third (A,B,C)', { labelIds: [labelA.id, labelB.id, labelC.id] }, (i) => i.labels.length === 3],
  ['labels → only C', { labelIds: [labelC.id] }, (i) => i.labels.length === 1 && i.labels[0].id === labelC.id],
  ['labels → none', { labelIds: [] }, (i) => i.labels.length === 0],
  ['status → done sets completedAt', { statusId: done.id }, (i) => i.statusId === done.id && Boolean(i.completedAt)],
  ['status → reopen clears completedAt', { statusId: todo.id }, (i) => i.statusId === todo.id && !i.completedAt],
]
for (const [label, changes, verify] of updates) {
  await step(`update ${label}`, 'PATCH', `/issues/${created.id}`, changes);
  issue = await detailOf(created.key);
  expect(`  ↳ saved: ${label}`, verify(issue), JSON.stringify(changes));
}

// --- Board move -----------------------------------------------------------
await step('drag to In progress (move)', 'PATCH', `/issues/${created.id}/move`, { statusId: inProgress.id, position: 0.5 }, 204);
issue = await detailOf(created.key);
expect('  ↳ moved to In progress', issue.statusId === inProgress.id);

// --- Watchers -------------------------------------------------------------
await step('watch', 'POST', `/issues/${created.id}/watchers`, undefined, 204);
expect('  ↳ isWatching true', (await detailOf(created.key)).isWatching === true);
await step('unwatch', 'DELETE', `/issues/${created.id}/watchers`, undefined, 204);
expect('  ↳ isWatching false', (await detailOf(created.key)).isWatching === false);

// --- Sub-tasks ------------------------------------------------------------
const extraSub = (await step('add sub-task', 'POST', '/issues', { projectId: project.id, title: 'Add totals row', parentId: created.id }, 201)).issue;
issue = await detailOf(created.key);
expect('  ↳ parent lists 3 sub-tasks', issue.subtasks.length === 3);
expect('  ↳ sub-task type is subtask', issue.subtasks.every((sub) => sub.type === 'subtask'));
await step('complete a sub-task', 'PATCH', `/issues/${extraSub.id}`, { statusId: done.id });

// --- Links ----------------------------------------------------------------
const other = (await step('create second issue', 'POST', '/issues', { projectId: project.id, title: 'Flow check: blocker' }, 201)).issue;
cleanup.push(other.id);
await step('link “blocks” by key', 'POST', `/issues/${created.id}/links`, { targetIssue: other.key, type: 'blocks' }, 201);
await step('duplicate link is rejected', 'POST', `/issues/${created.id}/links`, { targetIssue: other.key, type: 'blocks' }, 409);
await step('self-link is rejected', 'POST', `/issues/${created.id}/links`, { targetIssue: created.key, type: 'relates_to' }, 400);
issue = await detailOf(created.key);
const link = issue.links?.[0];
expect('  ↳ link listed', Boolean(link), JSON.stringify(issue.links));
const otherDetail = await detailOf(other.key);
expect('  ↳ shown on the other issue too', (otherDetail.links ?? []).length === 1);
if (link) {
  await step('remove link', 'DELETE', `/issue-links/${link.id}`, undefined, 204);
  expect('  ↳ link removed', ((await detailOf(created.key)).links ?? []).length === 0);
}

// --- Comments -------------------------------------------------------------
const comment = (await step('comment with @mention', 'POST', `/issues/${created.id}/comments`, { body: `Can you check this @[Priya Shah](${priya.id})?` }, 201)).comment;
const edited = (await step('edit comment', 'PATCH', `/comments/${comment.id}`, { body: 'Edited: please review' })).comment;
expect('  ↳ comment edited', edited.body === 'Edited: please review');
expect('  ↳ comment listed', (await call('GET', `/issues/${created.id}/comments`)).data.comments.length === 1);
await step('delete comment', 'DELETE', `/comments/${comment.id}`, undefined, 204);
expect('  ↳ comment removed', (await call('GET', `/issues/${created.id}/comments`)).data.comments.length === 0);

// --- Work log ---------------------------------------------------------------
const workLog = (await step('log 45m of work', 'POST', `/issues/${created.id}/work-logs`, { minutes: 45, note: 'Built exporter' }, 201)).workLog;
expect('  ↳ time spent = 45m', (await detailOf(created.key)).timeSpentMinutes === 45);
await step('delete work log', 'DELETE', `/work-logs/${workLog.id}`, undefined, 204);
expect('  ↳ time spent back to 0', (await detailOf(created.key)).timeSpentMinutes === 0);

// --- Attachments ------------------------------------------------------------
const form = new FormData();
form.append('files', new Blob(['id,name\n1,Alex\n'], { type: 'text/csv' }), 'payroll.csv');
const uploaded = (await step('upload attachment', 'POST', `/issues/${created.id}/attachments`, form, 201)).attachments;
const attachment = uploaded?.[0];
expect('  ↳ attachment saved', Boolean(attachment) && attachment.fileName === 'payroll.csv', JSON.stringify(uploaded));
if (attachment) {
  const download = await call('GET', `/attachments/${attachment.id}/download`, undefined, { raw: true });
  const content = await download.response.text();
  expect('  ↳ download returns the file', download.status === 200 && content.includes('1,Alex'), `${download.status}`);
  await step('delete attachment', 'DELETE', `/attachments/${attachment.id}`, undefined, 204);
  expect('  ↳ attachment removed', (await call('GET', `/issues/${created.id}/attachments`)).data.attachments.length === 0);
}

// --- History, AI, search, lists ----------------------------------------------
const { activities } = await step('history', 'GET', `/issues/${created.id}/activity`);
expect('  ↳ history recorded changes', activities.length >= 10, `${activities.length} entries`);
await step('AI summary', 'POST', `/ai/issues/${created.id}/summary`);
const breakdown = await step('AI break it down', 'POST', `/ai/issues/${created.id}/breakdown`);
expect('  ↳ breakdown suggests sub-tasks', Array.isArray(breakdown?.subtasks) || Array.isArray(breakdown?.suggestions), JSON.stringify(breakdown).slice(0, 120));
const search = await step('search by key', 'GET', `/search?q=${created.key}`);
expect('  ↳ search finds it', search.issues.some((item) => item.id === created.id));
await wait(300);
const list = await step('board list', 'GET', `/issues?projectId=${project.id}&limit=1000`);
expect('  ↳ appears in project list', list.issues.some((item) => item.id === created.id));

// --- Bulk + delete -------------------------------------------------------------
await step('bulk: priority low + add label', 'PATCH', '/issues/bulk', { issueIds: [created.id, other.id], changes: { priority: 'low', addLabelIds: [labelA.id] } });
const [bulkA, bulkB] = await Promise.all([detailOf(created.key), detailOf(other.key)]);
expect('  ↳ bulk applied to both', bulkA.priority === 'low' && bulkB.priority === 'low' && bulkA.labels.some((l) => l.id === labelA.id));

const subtaskKeys = (await detailOf(created.key)).subtasks.map((sub) => sub.key);
for (const id of cleanup.reverse()) await step('cleanup: delete issue', 'DELETE', `/issues/${id}`, undefined, 204);
expect('deleted issue is gone', (await call('GET', `/issues/${created.key}`)).status === 404);
const leftovers = await Promise.all(subtaskKeys.map((key) => call('GET', `/issues/${key}`)));
expect('its sub-tasks were deleted with it', leftovers.every((result) => result.status === 404), `${leftovers.filter((r) => r.status !== 404).length} left`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll issue flows passed');
process.exit(failures ? 1 : 0);
