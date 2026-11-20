/*
 * Release notes markdown builder (no database).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildReleaseNotesMarkdown } from '../src/modules/versions/version-notes.js';

describe('buildReleaseNotesMarkdown', () => {
  it('groups fix issues by type and skips subtasks', () => {
    const markdown = buildReleaseNotesMarkdown(
      { name: '1.4.0', releaseDate: '2026-11-20' },
      [
        { key: 'VEC-2', title: 'Login crash', type: 'bug', status: { category: 'done' } },
        { key: 'VEC-1', title: 'Ship billing', type: 'story', status: { category: 'done' } },
        { key: 'VEC-9', title: 'Nested work', type: 'subtask', status: { category: 'todo' } },
        { key: 'VEC-3', title: 'Polish UI', type: 'task', status: { category: 'todo' } },
      ],
    );
    assert.match(markdown, /^# 1\.4\.0 — /);
    assert.match(markdown, /## Stories/);
    assert.match(markdown, /- VEC-1 Ship billing/);
    assert.match(markdown, /## Bug fixes/);
    assert.match(markdown, /- VEC-2 Login crash/);
    assert.match(markdown, /## Tasks/);
    assert.match(markdown, /- VEC-3 Polish UI _\(open\)_/);
    assert.doesNotMatch(markdown, /VEC-9/);
    assert.doesNotMatch(markdown, /Sub-tasks/);
  });

  it('renders an empty placeholder when there are no fix issues', () => {
    const markdown = buildReleaseNotesMarkdown({ name: '0.1.0' }, []);
    assert.match(markdown, /No fix-version issues yet/);
  });
});
