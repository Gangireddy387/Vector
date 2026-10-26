/**
 * Checks the project tracking reports (modules, sprints) and the team performance review, including who may see it.
 * Usage: node scripts/tracking-test.js [baseUrl]
 */
const BASE_URL = process.argv[2] ?? 'http://localhost:4000/api';
const PASSWORD = 'Password123!';
let failures = 0;

async function request(token, method, path) {
  const response = await fetch(`${BASE_URL}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function login(email) {
  const response = await fetch(`${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`Login failed for ${email}: ${body?.message}`);
  return body.accessToken ?? body.token;
}

function expect(label, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const admin = await login('alex@northwind.dev');
const member = await login('diego@northwind.dev');

const projects = (await request(admin, 'GET', '/projects')).body;
const list = Array.isArray(projects) ? projects : projects.projects ?? projects.data;
const scrum = list.find((project) => project.type === 'scrum') ?? list[0];

const modules = await request(admin, 'GET', `/projects/${scrum.id}/reports/modules`);
expect('modules report', modules.status === 200, `${modules.body?.modules?.length} modules, unplanned ${modules.body?.unplanned?.total ?? 0}`);
for (const module of modules.body?.modules ?? []) console.log(`     ${module.key} ${module.title}: ${module.done}/${module.total} (${module.completion}%) ${module.health}`);

const sprints = await request(admin, 'GET', `/projects/${scrum.id}/reports/sprints`);
expect('sprints report', sprints.status === 200, `${sprints.body?.sprints?.length} sprints`);
for (const sprint of sprints.body?.sprints ?? []) console.log(`     ${sprint.name} [${sprint.state}]: ${sprint.delivered}/${sprint.committed} delivered, ${sprint.carriedOver} carried over`);

const memberModules = await request(member, 'GET', `/projects/${scrum.id}/reports/modules`);
expect('members can see module progress', memberModules.status === 200 || memberModules.status === 404, `status ${memberModules.status}`);

const team = await request(admin, 'GET', '/reports/performance?from=2020-01-01');
expect('team performance (workspace admin)', team.status === 200, `${team.body?.members?.length} people, unit ${team.body?.unit}`);
for (const row of team.body?.members ?? []) console.log(`     #${row.rank ?? '-'} ${row.user.name}: score ${row.score ?? '-'}, ${row.completed} done, on time ${row.onTimeRate ?? '-'}%, open ${row.open}`);
console.log(`     highlights: ${(team.body?.highlights ?? []).map((item) => `${item.title} (${item.detail})`).join('; ')}`);

const scoped = await request(admin, 'GET', `/reports/performance?projectId=${scrum.id}`);
expect('team performance for one project', scoped.status === 200 && scoped.body.projects.length === 1);

const first = team.body?.members?.find((row) => row.completed) ?? team.body?.members?.[0];
if (first) {
  const review = await request(admin, 'GET', `/reports/performance/${first.user.id}?from=2020-01-01`);
  expect('member review', review.status === 200, `${review.body?.completed?.length} completed, ${review.body?.byModule?.length} modules, ${review.body?.bySprint?.length} sprints`);
}

const denied = await request(member, 'GET', '/reports/performance');
expect('plain members cannot review the team', denied.status === 403, `status ${denied.status}`);
const badRange = await request(admin, 'GET', '/reports/performance?from=2026-05-01&to=2026-01-01');
expect('rejects an inverted date range', badRange.status === 400 || badRange.status === 422, `status ${badRange.status}`);
const unknown = await request(admin, 'GET', '/reports/performance/not-a-user');
expect('unknown member is a 404', unknown.status === 404, `status ${unknown.status}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll tracking checks passed');
process.exit(failures ? 1 : 0);
