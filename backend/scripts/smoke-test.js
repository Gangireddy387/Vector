/**
 * End-to-end smoke test against a running API seeded with `npm run db:seed`.
 * Usage: node scripts/smoke-test.js [baseUrl]
 */
const BASE_URL = process.argv[2] ?? 'http://localhost:4000/api';
let token = null;
let failures = 0;

async function call(method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  return { status: response.status, data };
}

async function check(label, method, path, body, expectedStatus = 200) {
  const result = await call(method, path, body);
  const ok = result.status === expectedStatus;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${method.padEnd(6)} ${path} -> ${result.status} ${ok ? '' : JSON.stringify(result.data)}  (${label})`);
  return result.data;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const session = await check('login', 'POST', '/auth/login', { email: 'alex@vector.dev', password: 'Password123!' });
token = session.token;
await check('me', 'GET', '/auth/me');

const { projects } = await check('projects', 'GET', '/projects');
const project = projects.find((item) => item.key === 'VEC');
const detail = (await check('project detail', 'GET', `/projects/${project.id}`)).project;
const [todo, inProgress, , done] = detail.statuses;

await check('dashboard', 'GET', '/dashboard');
await check('my work', 'GET', '/issues/my-work');
await check('board issues', 'GET', `/issues?projectId=${project.id}&sprintId=active`);
await check('backlog issues', 'GET', `/issues?projectId=${project.id}&sprintId=backlog&parentId=none`);
await check('filters', 'GET', `/issues?projectId=${project.id}&assigneeId=me,unassigned&priority=high,highest&sort=priority`);
await check('overdue', 'GET', `/issues?overdue=true`);
await check('sprints', 'GET', `/projects/${project.id}/sprints`);
await check('search', 'GET', '/search?q=login');
await check('users', 'GET', `/users?projectId=${project.id}`);

const created = (await check('create urgent bug (automation)', 'POST', '/issues', {
  projectId: project.id,
  title: 'Checkout crashes on Safari',
  type: 'bug',
  priority: 'highest',
}, 201)).issue;
await wait(800);
const afterAutomation = (await check('issue detail', 'GET', `/issues/${created.key}`)).issue;
console.log(`      automation result: sprint=${afterAutomation.sprint?.name ?? 'none'} assignee=${afterAutomation.assignee?.name ?? 'none'}`);
if (!afterAutomation.sprint || !afterAutomation.assignee) {
  failures += 1;
  console.log('FAIL  automation rule "Triage urgent bugs" did not apply');
}

await check('update', 'PATCH', `/issues/${created.id}`, { statusId: inProgress.id, storyPoints: 3, dueDate: '2030-01-01' });
await check('move', 'PATCH', `/issues/${created.id}/move`, { statusId: todo.id, position: 1.5 }, 204);
await check('comment', 'POST', `/issues/${created.id}/comments`, { body: 'Investigating now' }, 201);
await check('worklog', 'POST', `/issues/${created.id}/work-logs`, { minutes: 45, note: 'Debugging' }, 201);
await check('activity', 'GET', `/issues/${created.id}/activity`);
await check('ai draft', 'POST', '/ai/draft-issue', { projectId: project.id, title: 'Fix broken password reset email' });
await check('ai summary', 'POST', `/ai/issues/${created.id}/summary`);
await check('ai breakdown', 'POST', `/ai/issues/${created.id}/breakdown`);

const subtask = (await check('subtask', 'POST', '/issues', { projectId: project.id, title: 'Write fix', parentId: created.id }, 201)).issue;
await check('complete subtask', 'PATCH', `/issues/${subtask.id}`, { statusId: done.id });
await wait(800);
const parent = (await check('parent auto-closed', 'GET', `/issues/${created.id}`)).issue;
if (parent.status.category !== 'done') {
  failures += 1;
  console.log('FAIL  parent was not closed after its only sub-task was done');
}

await check('template list', 'GET', `/projects/${project.id}/templates`);
await check('automations', 'GET', `/projects/${project.id}/automations`);
await check('recurring', 'GET', `/projects/${project.id}/recurring-tasks`);
await check('report summary', 'GET', `/projects/${project.id}/reports/summary`);
await check('velocity', 'GET', `/projects/${project.id}/reports/velocity`);
const { sprints } = await call('GET', `/projects/${project.id}/sprints`).then((result) => result.data);
const active = sprints.find((sprint) => sprint.state === 'active');
await check('burndown', 'GET', `/projects/${project.id}/reports/sprints/${active.id}/burndown`);
await check('notifications', 'GET', '/notifications');
await check('bulk update', 'PATCH', '/issues/bulk', { issueIds: [created.id], changes: { priority: 'high' } });
await check('delete issue', 'DELETE', `/issues/${created.id}`, undefined, 204);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
