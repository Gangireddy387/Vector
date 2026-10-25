/**
 * Checks team chat (task references, mentions, assistant commands), task follow-up records and daily standups.
 * Cleans up everything it creates. Usage: node scripts/collaboration-test.js [baseUrl]
 */
const BASE_URL = process.argv[2] ?? 'http://localhost:4000/api';
const PASSWORD = 'Password123!';
let failures = 0;

async function request(token, method, path, body) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json().catch(() => null) };
}

async function login(email) {
  const response = await fetch(`${BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  const body = await response.json();
  if (!response.ok) throw new Error(`Login failed for ${email}: ${body?.message}`);
  return { token: body.accessToken ?? body.token, user: body.user };
}

function expect(label, condition, detail = '') {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}${detail ? ` - ${detail}` : ''}`);
  if (!condition) failures += 1;
}

const alex = await login('alex@vector.dev');
const diego = await login('diego@vector.dev');
const projects = (await request(alex.token, 'GET', '/projects')).body;
const list = Array.isArray(projects) ? projects : projects.projects ?? projects.data;
const project = list.find((item) => item.key === 'VEC') ?? list[0];
const issues = (await request(alex.token, 'GET', `/issues?projectId=${project.id}&limit=5`)).body.issues;
const task = issues[0];
const created = [];
const today = new Date().toISOString().slice(0, 10);

// Chat with a task reference and a mention
const mention = `@[${diego.user.name}](${diego.user.id})`;
const posted = await request(alex.token, 'POST', `/projects/${project.id}/chat/messages`, { body: `${mention} can you share an update on ${task.key.toLowerCase()} before standup?` });
expect('post a chat message', posted.status === 201, `status ${posted.status}`);
created.push(posted.body?.message?.id);
expect('task key is linked to the message (case-insensitive)', posted.body?.message?.issues?.some((issue) => issue.key === task.key));
expect('no assistant reply for a normal message', posted.body?.reply === null);

const inbox = (await request(diego.token, 'GET', '/notifications?unreadOnly=true')).body;
const notes = Array.isArray(inbox) ? inbox : inbox.notifications ?? [];
expect('mentioned teammate is notified', notes.some((note) => note.type === 'chat_mention' && note.link?.includes(posted.body?.message?.id)));

const history = await request(diego.token, 'GET', `/projects/${project.id}/chat/messages?limit=20`);
expect('list chat history', history.status === 200 && history.body.messages.some((message) => message.id === posted.body?.message?.id), `${history.body?.messages?.length} messages, ${history.body?.commands?.length} commands`);

// Assistant commands
for (const [command, type] of [['/help', 'help'], ['/standup', 'standup_draft'], [`/status ${task.key}`, 'issue_status'], ['/mytasks', 'issue_list'], ['/blockers', 'blockers'], ['/summary', 'standup_summary'], [`@vector what is the status of ${task.key}?`, null]]) {
  const response = await request(diego.token, 'POST', `/projects/${project.id}/chat/messages`, { body: command });
  created.push(response.body?.message?.id, response.body?.reply?.id);
  const reply = response.body?.reply;
  expect(`assistant answers ${command}`, response.status === 201 && reply?.kind === 'bot' && (!type || reply.meta?.type === type), reply ? `${reply.meta?.type}: ${reply.body.split('\n')[0].slice(0, 90)}` : `status ${response.status}`);
}

const edited = await request(alex.token, 'PATCH', `/chat/messages/${posted.body?.message?.id}`, { body: `Updated: ${task.key} and nothing else` });
expect('author can edit a message', edited.status === 200 && edited.body.message.editedAt);
const notMine = await request(diego.token, 'PATCH', `/chat/messages/${posted.body?.message?.id}`, { body: 'hijack' });
expect('others cannot edit it', notMine.status === 403, `status ${notMine.status}`);

// Standups
const draft = await request(diego.token, 'POST', `/projects/${project.id}/standups/draft`, { date: today });
expect('draft a standup', draft.status === 200 && typeof draft.body.yesterday === 'string', `${draft.body?.source}, facts ${JSON.stringify(draft.body?.facts)}`);

const saved = await request(diego.token, 'PUT', `/projects/${project.id}/standups/me`, { date: today, yesterday: `- Reviewed ${task.key}`, today: '- Pair on the release', blockers: `- Waiting for API keys for ${task.key}` });
expect('save my standup', saved.status === 200 && saved.body.update?.issueIds?.includes(task.id));

const day = await request(alex.token, 'GET', `/projects/${project.id}/standups?date=${today}`);
const diegoRow = day.body?.members?.find((member) => member.user.id === diego.user.id);
expect('standup day shows the update', day.status === 200 && diegoRow?.update?.blockers?.includes('API keys'), `${day.body?.stats?.posted}/${day.body?.stats?.expected} posted, ${day.body?.recentDays?.length} recent days`);
expect('referenced tasks are resolved for display', Boolean(day.body?.issues?.[task.key]));

const adminInbox = (await request(alex.token, 'GET', '/notifications?unreadOnly=true')).body;
const adminNotes = Array.isArray(adminInbox) ? adminInbox : adminInbox.notifications ?? [];
expect('admins are told about blockers', adminNotes.some((note) => note.type === 'standup_blocker'));

const future = await request(diego.token, 'PUT', `/projects/${project.id}/standups/me`, { date: '2099-01-01', today: 'x' });
expect('future standups are rejected', future.status === 400, `status ${future.status}`);

// Task follow-up record
const followups = await request(alex.token, 'GET', `/issues/${task.id}/followups`);
const kinds = new Set((followups.body?.followups ?? []).map((item) => item.type));
expect('task keeps a follow-up record from chat and standup', followups.status === 200 && kinds.has('chat') && kinds.has('standup'), `${followups.body?.followups?.length} follow-ups`);

// Clean up
await request(diego.token, 'DELETE', `/projects/${project.id}/standups/me?date=${today}`);
for (const id of created.filter(Boolean)) await request(alex.token, 'DELETE', `/chat/messages/${id}`);
for (const session of [alex, diego]) {
  const inboxNow = (await request(session.token, 'GET', '/notifications?unreadOnly=false')).body;
  const items = Array.isArray(inboxNow) ? inboxNow : inboxNow.notifications ?? [];
  const fromTest = (link = '') => link.includes(`standup?date=${today}`) || created.some((id) => id && link.includes(id));
  const testNotes = items.filter((note) => ['chat_mention', 'chat_task', 'standup_blocker'].includes(note.type) && fromTest(note.link ?? ''));
  for (const note of testNotes) await request(session.token, 'DELETE', `/notifications/${note.id}`);
}
const after = await request(alex.token, 'GET', `/issues/${task.id}/followups`);
expect('cleanup removed the test records', after.body?.followups?.every((item) => !created.includes(item.id)));

console.log(failures ? `\n${failures} check(s) failed` : '\nAll collaboration checks passed');
process.exit(failures ? 1 : 0);
