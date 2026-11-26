/*
 * Backup import validation helpers (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countBackupStats,
  parseOrganizationBackup,
} from '../src/modules/organizations/workspace-backup-import.service.js';

describe('parseOrganizationBackup', () => {
  it('accepts a minimal v1 or v2 backup', () => {
    const v1 = parseOrganizationBackup(
      JSON.stringify({ format: 'vector-org-backup', version: 1, projects: [], departments: [], members: [] }),
    );
    assert.equal(v1.format, 'vector-org-backup');
    assert.equal(v1.projects.length, 0);
    const v2 = parseOrganizationBackup(
      JSON.stringify({ format: 'vector-org-backup', version: 2, projects: [], departments: [], members: [] }),
    );
    assert.equal(v2.version, 2);
  });

  it('rejects wrong format or version', () => {
    assert.throws(() => parseOrganizationBackup('{'), /valid JSON/i);
    assert.throws(() => parseOrganizationBackup(JSON.stringify({ format: 'other', version: 1, projects: [] })), /vector-org-backup/i);
    assert.throws(
      () => parseOrganizationBackup(JSON.stringify({ format: 'vector-org-backup', version: 99, projects: [] })),
      /version 99/i,
    );
    assert.throws(() => parseOrganizationBackup(JSON.stringify({ format: 'vector-org-backup', version: 1 })), /projects/i);
  });
});

describe('countBackupStats', () => {
  it('tallies projects, issues, comments and embedded vs skipped attachments', () => {
    const stats = countBackupStats({
      projects: [
        {
          key: 'A',
          issues: [
            { comments: [{}, {}], attachments: [{ contentBase64: 'YWJj' }] },
            { comments: [], attachments: [{}, { contentBase64: 'ZGVm' }] },
          ],
          automationRules: [{}],
          recurringTasks: [{}, {}],
        },
        { key: 'B', issues: [] },
      ],
      departments: [{}, {}],
      members: [{}],
    });
    assert.deepEqual(stats, {
      projects: 2,
      issues: 2,
      comments: 2,
      attachments: 3,
      attachmentsEmbedded: 2,
      attachmentsSkipped: 1,
      automations: 1,
      recurringTasks: 2,
      departments: 2,
      members: 1,
    });
  });
});
