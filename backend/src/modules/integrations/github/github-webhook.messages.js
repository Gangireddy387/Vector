/**
 * Pure helpers that turn GitHub webhook payloads into Vector comment bodies.
 * Kept separate so SN42 sync rules can be unit-tested without a database.
 */

export function repoFromPayload(payload) {
  const full = payload?.repository?.full_name || '';
  const [owner, repo] = String(full).split('/');
  return { owner: owner || null, repo: repo || null };
}

/** Default true — merge still closes the linked Vector task unless the org turns it off. */
export function mergeClosesIssueOf(settings = {}) {
  return settings.mergeClosesIssue !== false;
}

export function pullRequestCommentBody(action, pullRequest, { owner, repo }) {
  if (!pullRequest?.number) return null;
  const number = pullRequest.number;
  const title = pullRequest.title || `PR #${number}`;
  const url = pullRequest.html_url || `https://github.com/${owner}/${repo}/pull/${number}`;
  const label = `[#${number} ${title}](${url})`;

  switch (action) {
    case 'opened':
      return `GitHub pull request ${label} was **opened**.`;
    case 'reopened':
      return `GitHub pull request ${label} was **reopened**.`;
    case 'ready_for_review':
      return `GitHub pull request ${label} is **ready for review**.`;
    case 'synchronize':
      return `New commits were pushed to GitHub pull request ${label}.`;
    case 'closed':
      return pullRequest.merged
        ? `GitHub pull request ${label} was **merged**.`
        : `GitHub pull request ${label} was closed without merging.`;
    default:
      return null;
  }
}

export function pullRequestReviewCommentBody(payload, { owner, repo }) {
  const review = payload?.review;
  const pullRequest = payload?.pull_request;
  if (!review || !pullRequest?.number) return null;
  const number = pullRequest.number;
  const title = pullRequest.title || `PR #${number}`;
  const url = review.html_url || pullRequest.html_url || `https://github.com/${owner}/${repo}/pull/${number}`;
  const author = review.user?.login || 'GitHub';
  const state = String(review.state || '').toLowerCase();
  const verb =
    state === 'approved'
      ? '**approved**'
      : state === 'changes_requested'
        ? '**requested changes** on'
        : '**reviewed**';
  const lines = [`**${author}** ${verb} GitHub pull request [#${number} ${title}](${url}).`];
  if (review.body?.trim()) {
    lines.push('', review.body.trim());
  }
  return lines.join('\n');
}

export function checkRunCommentBody(payload, { owner, repo }) {
  const check = payload?.check_run;
  if (!check || payload?.action !== 'completed') return null;
  const conclusion = String(check.conclusion || 'unknown');
  // Skip noisy neutral/cancelled/skipped noise; surface pass/fail/error.
  if (!['success', 'failure', 'timed_out', 'action_required', 'startup_failure'].includes(conclusion)) {
    return null;
  }
  const prs = Array.isArray(check.pull_requests) ? check.pull_requests : [];
  if (!prs.length) return null;

  const name = check.name || 'Check';
  const url = check.html_url || check.details_url || `https://github.com/${owner}/${repo}`;
  const emoji = conclusion === 'success' ? '✅' : '❌';
  return {
    body: `${emoji} GitHub check **${name}** completed: **${conclusion}** ([details](${url})).`,
    pullNumbers: prs.map((pr) => pr.number).filter(Boolean),
  };
}

export function issueCommentBody(payload, { owner, repo }) {
  if (payload?.action !== 'created' || !payload?.comment) return null;
  const number = payload.issue?.number;
  if (!number) return null;
  const author = payload.comment.user?.login || 'GitHub';
  const url = payload.comment.html_url || `https://github.com/${owner}/${repo}/issues/${number}`;
  return [
    `**${author}** commented on GitHub [${owner}/${repo}#${number}](${url}):`,
    '',
    payload.comment.body || '_(empty comment)_',
  ].join('\n');
}

export function githubIssueClosedBody(payload, { owner, repo }) {
  if (payload?.action !== 'closed' || !payload?.issue) return null;
  const number = payload.issue.number;
  const title = payload.issue.title || `Issue #${number}`;
  const url = payload.issue.html_url || `https://github.com/${owner}/${repo}/issues/${number}`;
  return `GitHub issue [#${number} ${title}](${url}) was **closed**.`;
}

/** Actions Vector should take for one verified delivery (no DB). */
export function planGithubWebhookActions(event, payload, settings = {}) {
  const { owner, repo } = repoFromPayload(payload);
  const actions = [];

  if (event === 'ping') return { owner, repo, actions: [{ type: 'ping' }] };

  if (event === 'issue_comment') {
    const body = issueCommentBody(payload, { owner, repo });
    if (body) {
      const number = payload.issue.number;
      const kind = payload.issue?.pull_request ? 'pull' : 'issue';
      actions.push({ type: 'comment', owner, repo, number, kind, body });
    }
  }

  if (event === 'pull_request') {
    const body = pullRequestCommentBody(payload.action, payload.pull_request, { owner, repo });
    if (body) {
      const number = payload.pull_request.number;
      const merged = Boolean(payload.pull_request.merged) && payload.action === 'closed';
      actions.push({
        type: 'comment',
        owner,
        repo,
        number,
        kind: 'pull',
        body,
        markDone: merged && mergeClosesIssueOf(settings),
      });
    }
  }

  if (event === 'pull_request_review' && payload.action === 'submitted') {
    const body = pullRequestReviewCommentBody(payload, { owner, repo });
    if (body) {
      actions.push({
        type: 'comment',
        owner,
        repo,
        number: payload.pull_request.number,
        kind: 'pull',
        body,
      });
    }
  }

  if (event === 'check_run') {
    const result = checkRunCommentBody(payload, { owner, repo });
    if (result) {
      for (const number of result.pullNumbers) {
        actions.push({ type: 'comment', owner, repo, number, kind: 'pull', body: result.body });
      }
    }
  }

  if (event === 'issues') {
    const body = githubIssueClosedBody(payload, { owner, repo });
    if (body) {
      actions.push({
        type: 'comment',
        owner,
        repo,
        number: payload.issue.number,
        kind: 'issue',
        body,
      });
    }
  }

  return { owner, repo, actions };
}
