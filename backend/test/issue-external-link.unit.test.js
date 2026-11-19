/*
 * GitHub / GitLab URL parsing for pasted external issue links.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseExternalIssueUrl } from '../src/modules/issues/issue-external-link.parse.js';

describe('parseExternalIssueUrl', () => {
  it('parses GitHub issues and pulls', () => {
    const issue = parseExternalIssueUrl('https://github.com/acme/vector/issues/42');
    assert.equal(issue.provider, 'github');
    assert.equal(issue.owner, 'acme');
    assert.equal(issue.repo, 'vector');
    assert.equal(issue.number, 42);
    assert.equal(issue.kind, 'issue');
    assert.equal(issue.label, 'acme/vector#42');

    const pull = parseExternalIssueUrl('https://github.com/acme/vector/pull/7');
    assert.equal(pull.kind, 'pull');
    assert.equal(pull.number, 7);
  });

  it('parses GitLab issues and merge requests including subgroups', () => {
    const issue = parseExternalIssueUrl('https://gitlab.com/group/sub/project/-/issues/9');
    assert.equal(issue.provider, 'gitlab');
    assert.equal(issue.owner, 'group/sub');
    assert.equal(issue.repo, 'project');
    assert.equal(issue.number, 9);
    assert.equal(issue.kind, 'issue');
    assert.equal(issue.label, 'group/sub/project#9');

    const mr = parseExternalIssueUrl('https://gitlab.com/acme/app/-/merge_requests/3');
    assert.equal(mr.kind, 'merge_request');
    assert.equal(mr.number, 3);
  });

  it('parses self-hosted GitLab-style paths', () => {
    const link = parseExternalIssueUrl('https://git.example.com/team/app/-/issues/11');
    assert.equal(link.provider, 'gitlab');
    assert.equal(link.host, 'git.example.com');
    assert.equal(link.number, 11);
  });

  it('falls back to a host + path label for other https URLs', () => {
    const link = parseExternalIssueUrl('https://example.com/tickets/abc');
    assert.equal(link.provider, 'other');
    assert.equal(link.number, null);
    assert.match(link.label, /example\.com/);
  });

  it('rejects empty or non-http URLs', () => {
    assert.throws(() => parseExternalIssueUrl(''), /URL|Required/i);
    assert.throws(() => parseExternalIssueUrl('not a url'), /valid URL/i);
    assert.throws(() => parseExternalIssueUrl('ftp://github.com/a/b/issues/1'), /http/i);
  });
});
