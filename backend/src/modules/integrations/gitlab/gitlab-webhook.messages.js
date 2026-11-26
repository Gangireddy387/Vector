/**
 * Pure helpers that turn GitLab webhook payloads into Vector comment bodies.
 */

export function pathFromPayload(payload) {
  const full = payload?.project?.path_with_namespace || payload?.project?.path || '';
  const parts = String(full).split('/').filter(Boolean);
  if (parts.length < 2) return { owner: null, repo: null, path: full || null };
  return { owner: parts.slice(0, -1).join('/'), repo: parts.at(-1), path: full };
}

/** Default true — merge still closes the linked Vector task unless the org turns it off. */
export function mergeClosesIssueOf(settings = {}) {
  return settings.mergeClosesIssue !== false;
}

function webUrl(payload, fallbackPath) {
  return payload?.object_attributes?.url || payload?.project?.web_url || fallbackPath || '';
}

export function noteCommentBody(payload, { owner, repo }) {
  const note = payload?.object_attributes;
  if (!note?.note || note.action === 'delete') return null;
  const noteable = String(note.noteable_type || '').toLowerCase();
  const author = payload?.user?.name || payload?.user?.username || 'GitLab';
  const iid =
    noteable === 'mergerequest' || noteable === 'merge_request'
      ? payload?.merge_request?.iid ?? note.noteable_iid
      : payload?.issue?.iid ?? note.noteable_iid;
  if (!iid) return null;
  const kind = noteable === 'mergerequest' || noteable === 'merge_request' ? 'merge_request' : 'issue';
  const label = kind === 'merge_request' ? 'merge request' : 'issue';
  const url = note.url || webUrl(payload, `https://gitlab.com/${owner}/${repo}/-/${kind === 'merge_request' ? 'merge_requests' : 'issues'}/${iid}`);
  return {
    body: [`**${author}** commented on GitLab ${label} [${owner}/${repo}!${iid}](${url}):`, '', note.note].join('\n'),
    number: Number(iid),
    kind,
  };
}

export function mergeRequestCommentBody(payload, { owner, repo }) {
  const mr = payload?.object_attributes;
  if (!mr?.iid) return null;
  const action = String(mr.action || '').toLowerCase();
  const number = mr.iid;
  const title = mr.title || `MR !${number}`;
  const url = mr.url || `https://gitlab.com/${owner}/${repo}/-/merge_requests/${number}`;
  const label = `[!${number} ${title}](${url})`;

  let body = null;
  if (action === 'open') body = `GitLab merge request ${label} was **opened**.`;
  else if (action === 'reopen') body = `GitLab merge request ${label} was **reopened**.`;
  else if (action === 'close') body = `GitLab merge request ${label} was **closed**.`;
  else if (action === 'merge') body = `GitLab merge request ${label} was **merged**.`;
  else if (action === 'update' && mr.oldrev) body = `New commits were pushed to GitLab merge request ${label}.`;
  else return null;

  return {
    body,
    number,
    kind: 'merge_request',
    markDone: action === 'merge',
  };
}

export function gitlabIssueClosedBody(payload, { owner, repo }) {
  const issue = payload?.object_attributes;
  if (!issue?.iid || String(issue.action || '').toLowerCase() !== 'close') return null;
  const number = issue.iid;
  const title = issue.title || `Issue #${number}`;
  const url = issue.url || `https://gitlab.com/${owner}/${repo}/-/issues/${number}`;
  return {
    body: `GitLab issue [#${number} ${title}](${url}) was **closed**.`,
    number,
    kind: 'issue',
  };
}

/** Actions Vector should take for one verified delivery (no DB). */
export function planGitlabWebhookActions(event, payload, settings = {}) {
  const { owner, repo } = pathFromPayload(payload);
  const actions = [];
  const kind = String(payload?.object_kind || event || '').toLowerCase();

  if (kind === 'ping' || event === 'Ping Hook') return { owner, repo, actions: [{ type: 'ping' }] };

  if (kind === 'note' || event === 'Note Hook') {
    const note = noteCommentBody(payload, { owner, repo });
    if (note) {
      actions.push({
        type: 'comment',
        owner,
        repo,
        number: note.number,
        kind: note.kind,
        body: note.body,
      });
    }
  }

  if (kind === 'merge_request' || event === 'Merge Request Hook') {
    const mr = mergeRequestCommentBody(payload, { owner, repo });
    if (mr) {
      actions.push({
        type: 'comment',
        owner,
        repo,
        number: mr.number,
        kind: mr.kind,
        body: mr.body,
        markDone: mr.markDone && mergeClosesIssueOf(settings),
      });
    }
  }

  if (kind === 'issue' || event === 'Issue Hook') {
    const closed = gitlabIssueClosedBody(payload, { owner, repo });
    if (closed) {
      actions.push({
        type: 'comment',
        owner,
        repo,
        number: closed.number,
        kind: closed.kind,
        body: closed.body,
      });
    }
  }

  return { owner, repo, actions };
}
