/*
 * Backup import validation helpers (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOrganizationBackup } from '../src/modules/organizations/workspace-backup-import.service.js';

describe('parseOrganizationBackup', () => {
  it('accepts a minimal v1 backup', () => {
    const payload = parseOrganizationBackup(
      JSON.stringify({ format: 'vector-org-backup', version: 1, projects: [], departments: [], members: [] }),
    );
    assert.equal(payload.format, 'vector-org-backup');
    assert.equal(payload.projects.length, 0);
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
