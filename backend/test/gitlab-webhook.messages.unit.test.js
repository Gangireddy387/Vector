/*
 * GitLab webhook payload → Vector comment actions (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planGitlabWebhookActions } from '../src/modules/integrations/gitlab/gitlab-webhook.messages.js';

describe('planGitlabWebhookActions', () => {
  it('turns a note on an issue into a comment action', () => {
    const { actions } = planGitlabWebhookActions('Note Hook', {
      object_kind: 'note',
      project: { path_with_namespace: 'acme/app' },
      user: { username: 'jane' },
      object_attributes: {
        note: 'Looks good',
        noteable_type: 'Issue',
        noteable_iid: 12,
        url: 'https://gitlab.com/acme/app/-/issues/12#note_1',
      },
      issue: { iid: 12 },
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].type, 'comment');
    assert.equal(actions[0].owner, 'acme');
    assert.equal(actions[0].repo, 'app');
    assert.equal(actions[0].number, 12);
    assert.equal(actions[0].kind, 'issue');
    assert.match(actions[0].body, /Looks good/);
  });

  it('marks Done when a merge request merges and the setting allows it', () => {
    const { actions } = planGitlabWebhookActions('Merge Request Hook', {
      object_kind: 'merge_request',
      project: { path_with_namespace: 'acme/app' },
      object_attributes: {
        action: 'merge',
        iid: 9,
        title: 'Fix login',
        url: 'https://gitlab.com/acme/app/-/merge_requests/9',
      },
    });
    assert.equal(actions.length, 1);
    assert.equal(actions[0].kind, 'merge_request');
    assert.equal(actions[0].markDone, true);
    assert.match(actions[0].body, /merged/i);
  });

  it('does not mark Done when mergeClosesIssue is false', () => {
    const { actions } = planGitlabWebhookActions(
      'Merge Request Hook',
      {
        object_kind: 'merge_request',
        project: { path_with_namespace: 'acme/app' },
        object_attributes: { action: 'merge', iid: 9, title: 'Fix', url: 'https://gitlab.com/acme/app/-/merge_requests/9' },
      },
      { mergeClosesIssue: false },
    );
    assert.equal(actions[0].markDone, false);
  });
});
