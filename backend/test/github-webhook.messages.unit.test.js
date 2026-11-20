import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mergeClosesIssueOf,
  planGithubWebhookActions,
  pullRequestCommentBody,
} from '../src/modules/integrations/github/github-webhook.messages.js';

const repo = { owner: 'acme', repo: 'app' };

describe('github webhook message planning', () => {
  it('defaults mergeClosesIssue to true', () => {
    assert.equal(mergeClosesIssueOf({}), true);
    assert.equal(mergeClosesIssueOf({ mergeClosesIssue: true }), true);
    assert.equal(mergeClosesIssueOf({ mergeClosesIssue: false }), false);
  });

  it('builds PR lifecycle comments', () => {
    const pr = { number: 12, title: 'Fix login', html_url: 'https://github.com/acme/app/pull/12', merged: false };
    assert.match(pullRequestCommentBody('opened', pr, repo), /opened/);
    assert.match(pullRequestCommentBody('synchronize', pr, repo), /New commits/);
    assert.match(pullRequestCommentBody('ready_for_review', pr, repo), /ready for review/);
    assert.match(pullRequestCommentBody('closed', { ...pr, merged: true }, repo), /merged/);
    assert.match(pullRequestCommentBody('closed', pr, repo), /without merging/);
    assert.equal(pullRequestCommentBody('edited', pr, repo), null);
  });

  it('plans PR open + review + check + merge with markDone', () => {
    const opened = planGithubWebhookActions(
      'pull_request',
      {
        action: 'opened',
        repository: { full_name: 'acme/app' },
        pull_request: { number: 7, title: 'Add sync', html_url: 'https://github.com/acme/app/pull/7' },
      },
      {},
    );
    assert.equal(opened.actions.length, 1);
    assert.equal(opened.actions[0].kind, 'pull');
    assert.equal(opened.actions[0].markDone, false);
    assert.match(opened.actions[0].body, /opened/);

    const review = planGithubWebhookActions(
      'pull_request_review',
      {
        action: 'submitted',
        repository: { full_name: 'acme/app' },
        pull_request: { number: 7, title: 'Add sync', html_url: 'https://github.com/acme/app/pull/7' },
        review: {
          state: 'approved',
          user: { login: 'pat' },
          html_url: 'https://github.com/acme/app/pull/7#pullrequestreview-1',
          body: 'LGTM',
        },
      },
      {},
    );
    assert.equal(review.actions.length, 1);
    assert.match(review.actions[0].body, /approved/);
    assert.match(review.actions[0].body, /LGTM/);

    const check = planGithubWebhookActions(
      'check_run',
      {
        action: 'completed',
        repository: { full_name: 'acme/app' },
        check_run: {
          name: 'ci',
          conclusion: 'failure',
          html_url: 'https://github.com/acme/app/runs/1',
          pull_requests: [{ number: 7 }],
        },
      },
      {},
    );
    assert.equal(check.actions.length, 1);
    assert.match(check.actions[0].body, /failure/);

    const merged = planGithubWebhookActions(
      'pull_request',
      {
        action: 'closed',
        repository: { full_name: 'acme/app' },
        pull_request: {
          number: 7,
          title: 'Add sync',
          html_url: 'https://github.com/acme/app/pull/7',
          merged: true,
        },
      },
      { mergeClosesIssue: true },
    );
    assert.equal(merged.actions[0].markDone, true);

    const noClose = planGithubWebhookActions(
      'pull_request',
      {
        action: 'closed',
        repository: { full_name: 'acme/app' },
        pull_request: {
          number: 7,
          title: 'Add sync',
          html_url: 'https://github.com/acme/app/pull/7',
          merged: true,
        },
      },
      { mergeClosesIssue: false },
    );
    assert.equal(noClose.actions[0].markDone, false);
  });

  it('skips neutral check conclusions', () => {
    const skipped = planGithubWebhookActions(
      'check_run',
      {
        action: 'completed',
        repository: { full_name: 'acme/app' },
        check_run: {
          name: 'lint',
          conclusion: 'neutral',
          pull_requests: [{ number: 1 }],
        },
      },
      {},
    );
    assert.equal(skipped.actions.length, 0);
  });
});
