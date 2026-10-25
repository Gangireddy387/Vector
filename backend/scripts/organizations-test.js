/**
 * Checks multi-organization signup and isolation: own address, own projects and people, per-organization project keys,
 * invitations, switching and admin-only settings. Deletes the organization it creates.
 * Usage: node scripts/organizations-test.js [baseUrl]
 */
const BASE_URL = process.argv[2] ?? 'http://localhost:4000/api';
const PASSWORD = 'Password123!';
const TEST_EMAIL = 'org-test@vector.dev';
let failures = 0;

async function request(token, method, path, body, organizationId) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (organizationId) headers['X-Organization-Id'] = organizationId;
  const response = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: response.status === 204 ? null : await response.json().catch(() => null) };
}

function expect(label, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const slug = `acme-test-${Date.now().toString(36)}`;
const signup = { name: 'Nora Test', email: TEST_EMAIL, password: PASSWORD, organizationName: 'Acme Test', organizationSlug: slug };

// Address checks
const reserved = await request(null, 'GET', '/organizations/check-slug?slug=admin');
expect('reserved addresses are refused', reserved.body?.available === false, reserved.body?.reason);
const free = await request(null, 'GET', `/organizations/check-slug?slug=${slug}`);
expect('a new address is available', free.body?.available === true);

// Sign up (or reuse the test account and create the organization)
let session = await request(null, 'POST', '/auth/register', signup);
if (session.status === 409) {
  const login = await request(null, 'POST', '/auth/login', { email: TEST_EMAIL, password: PASSWORD });
  const created = await request(login.body.token, 'POST', '/organizations', { name: signup.organizationName, slug });
  session = { status: created.status, body: { ...created.body, token: login.body.token } };
}
const nora = session.body;
expect('signup creates the organization', [200, 201].includes(session.status) && nora.organization?.slug === slug, `${session.status} ${nora.organization?.name}`);
expect('the founder is its admin', nora.user?.workspaceRole === 'admin' && nora.organization?.role === 'admin');
const acmeId = nora.organization.id;

const taken = await request(null, 'GET', `/organizations/check-slug?slug=${slug}`);
expect('a used address is taken, with a suggestion', taken.body?.available === false && Boolean(taken.body?.suggestion), taken.body?.suggestion);
const dupe = await request(null, 'POST', '/auth/register', { ...signup, email: 'someone-else@vector.dev' });
expect('signup with a taken address is rejected on the address field', dupe.status === 400 && dupe.body?.details?.some((detail) => detail.path === 'organizationSlug'), dupe.body?.message);

// Isolation from the demo organization
const alex = (await request(null, 'POST', '/auth/login', { email: 'alex@vector.dev', password: PASSWORD })).body;
const project = await request(nora.token, 'POST', '/projects', { name: 'Acme Web', key: 'VEC', type: 'kanban' }, acmeId);
expect('project keys are per organization (VEC exists in the demo org too)', project.status === 201, `status ${project.status} ${project.body?.message ?? ''}`);
const acmeProject = project.body?.project ?? project.body;
const issue = await request(nora.token, 'POST', '/issues', { projectId: acmeProject.id, title: 'Acme first task' }, acmeId);
const acmeIssue = issue.body?.issue;
expect('issue keys can repeat across organizations', acmeIssue?.key?.startsWith('VEC-'), acmeIssue?.key);

const noraProjects = (await request(nora.token, 'GET', '/projects', null, acmeId)).body;
const noraList = Array.isArray(noraProjects) ? noraProjects : noraProjects.projects;
expect('each organization sees only its own projects', noraList.length === 1 && noraList[0].id === acmeProject.id, `${noraList.length} project(s)`);
const alexProjects = (await request(alex.token, 'GET', '/projects')).body;
const alexList = Array.isArray(alexProjects) ? alexProjects : alexProjects.projects;
expect('the demo organization does not see Acme projects', !alexList.some((item) => item.id === acmeProject.id));

const alexIssue = await request(alex.token, 'GET', `/issues/${acmeIssue.key}`);
expect('the same key opens each organization\'s own issue', alexIssue.status === 200 && alexIssue.body.issue.projectId !== acmeProject.id, alexIssue.body?.issue?.title);
const crossProject = await request(alex.token, 'GET', `/projects/${acmeProject.id}`);
expect('outsiders cannot open another organization\'s project', crossProject.status === 404, `status ${crossProject.status}`);
const people = (await request(nora.token, 'GET', '/users', null, acmeId)).body;
const peopleList = Array.isArray(people) ? people : people.users;
expect('people search stays inside the organization', peopleList.length === 1 && peopleList[0].email === TEST_EMAIL, `${peopleList.length} people`);

// Invitations, switching and roles
const invited = await request(nora.token, 'POST', '/workspace/invitations', { email: 'diego@vector.dev', role: 'member' }, acmeId);
expect('admins invite people to the organization', invited.status === 201 && invited.body.member?.workspaceRole === 'member', `status ${invited.status}`);
const again = await request(nora.token, 'POST', '/workspace/invitations', { email: 'diego@vector.dev' }, acmeId);
expect('inviting someone twice is refused', again.status === 409);

const diego = (await request(null, 'POST', '/auth/login', { email: 'diego@vector.dev', password: PASSWORD })).body;
const diegoOrgs = (await request(diego.token, 'GET', '/organizations')).body.organizations;
expect('an invited person can belong to several organizations', diegoOrgs.some((org) => org.id === acmeId) && diegoOrgs.length >= 2, diegoOrgs.map((org) => org.name).join(', '));
const switched = await request(diego.token, 'POST', `/organizations/${acmeId}/switch`);
expect('switching returns the new current organization', switched.status === 200 && switched.body.organization?.id === acmeId && switched.body.user.workspaceRole === 'member');
const diegoInAcme = (await request(diego.token, 'GET', '/projects', null, acmeId)).body;
const diegoAcmeList = Array.isArray(diegoInAcme) ? diegoInAcme : diegoInAcme.projects;
expect('members only see projects they were added to', diegoAcmeList.length === 0);
const notAdmin = await request(diego.token, 'PATCH', '/workspace', { name: 'Hijacked' }, acmeId);
expect('members cannot change organization settings', notAdmin.status === 403, `status ${notAdmin.status}`);
await request(diego.token, 'POST', `/organizations/${diegoOrgs.find((org) => org.id !== acmeId).id}/switch`);

const renamed = await request(nora.token, 'PATCH', '/workspace', { name: 'Acme Test Co' }, acmeId);
expect('admins rename the organization', renamed.status === 200 && renamed.body.settings.name === 'Acme Test Co');
const members = (await request(nora.token, 'GET', '/workspace/members', null, acmeId)).body.members;
expect('the member list covers only this organization', members.length === 2 && members.some((member) => member.email === 'diego@vector.dev'), members.map((member) => member.name).join(', '));
const alexMembers = (await request(alex.token, 'GET', '/workspace/members')).body.members;
expect('the demo organization does not list Acme people', !alexMembers.some((member) => member.email === TEST_EMAIL));
const removed = await request(nora.token, 'DELETE', `/workspace/members/${invited.body.member.id}`, null, acmeId);
expect('admins remove people from the organization', removed.status === 204);

const forged = await request(alex.token, 'GET', '/projects', null, acmeId);
const forgedList = Array.isArray(forged.body) ? forged.body : forged.body.projects;
expect('asking for an organization you are not in falls back to your own', !forgedList.some((item) => item.id === acmeProject.id));

// Clean up
const wrongName = await request(nora.token, 'DELETE', '/workspace', { confirmName: 'nope' }, acmeId);
expect('deleting needs the exact organization name', wrongName.status === 400);
const deleted = await request(nora.token, 'DELETE', '/workspace', { confirmName: 'Acme Test Co' }, acmeId);
expect('admins delete the organization', deleted.status === 204);
const afterDelete = (await request(nora.token, 'GET', '/auth/me')).body;
expect('without an organization the session says so', afterDelete.organization === null, `${afterDelete.organizations?.length} organizations`);
const blocked = await request(nora.token, 'GET', '/projects');
expect('organization pages ask to create or join one first', blocked.status === 409 && blocked.body?.details?.code === 'no_organization');
const alexIssueAfter = await request(alex.token, 'GET', `/issues/${acmeIssue.key}`);
expect('the demo organization is untouched', alexIssueAfter.status === 200);

console.log(failures ? `\n${failures} check(s) failed` : '\nAll organization checks passed');
process.exit(failures ? 1 : 0);
