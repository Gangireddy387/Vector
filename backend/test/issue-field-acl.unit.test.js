import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertIssueFieldChanges,
  cleanFieldPermissions,
  editableIssueFieldsFor,
} from '../src/modules/projects/issue-field-acl.js';

describe('issue field ACL', () => {
  it('drops unknown keys and empty actor lists', () => {
    assert.deepEqual(
      cleanFieldPermissions({
        assigneeId: ['admin', 'scrum_master', 'nope'],
        priority: [],
        statusId: ['admin'],
      }),
      { assigneeId: ['admin', 'scrum_master'] },
    );
  });

  it('allows every field when no rules are set', () => {
    const map = editableIssueFieldsFor({
      fieldPermissions: {},
      role: 'member',
      userId: 'u1',
      projectLeadId: 'lead',
      teamLeadId: null,
    });
    assert.equal(map.assigneeId, true);
    assert.equal(map.storyPoints, true);
  });

  it('restricts fields to listed actors', () => {
    const rules = { assigneeId: ['admin', 'scrum_master'], priority: ['admin'] };
    const member = editableIssueFieldsFor({
      fieldPermissions: rules,
      role: 'member',
      userId: 'u1',
      projectLeadId: 'lead',
      teamLeadId: null,
    });
    assert.equal(member.assigneeId, false);
    assert.equal(member.priority, false);
    assert.equal(member.title, true);

    const lead = editableIssueFieldsFor({
      fieldPermissions: rules,
      role: 'member',
      userId: 'lead',
      projectLeadId: 'lead',
      teamLeadId: null,
    });
    assert.equal(lead.assigneeId, true);
    assert.equal(lead.priority, false);
  });

  it('rejects unauthorized changes and bypasses system source', async () => {
    const project = {
      id: 'p1',
      leadId: 'lead',
      settings: { fieldPermissions: { assigneeId: ['admin'] } },
      team: { leadId: null },
    };

    await assert.rejects(
      () =>
        assertIssueFieldChanges({
          project,
          role: 'member',
          actor: { id: 'u1' },
          changedKeys: ['assigneeId'],
          context: { source: 'user' },
        }),
      /Only Admins can change assignee/i,
    );

    await assertIssueFieldChanges({
      project,
      role: 'member',
      actor: { id: 'u1' },
      changedKeys: ['assigneeId'],
      context: { source: 'system' },
    });
  });
});
