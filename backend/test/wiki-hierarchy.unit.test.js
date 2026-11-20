import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Client/server shared tree rules for wiki folders (pure, no DB).
 * Mirrors frontend buildWikiTree expectations.
 */
function buildWikiTree(pages) {
  const byParent = new Map();
  for (const page of pages) {
    const key = page.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(page);
    byParent.set(key, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
  }
  function nest(parentId) {
    return (byParent.get(parentId) ?? []).map((page) => ({
      ...page,
      children: page.kind === 'folder' ? nest(page.id) : [],
    }));
  }
  return nest(null);
}

describe('wiki hierarchy tree', () => {
  it('nests pages under folders and keeps root pages', () => {
    const tree = buildWikiTree([
      { id: 'f1', title: 'Ops', kind: 'folder', parentId: null, position: 0 },
      { id: 'p1', title: 'Runbook', kind: 'page', parentId: 'f1', position: 0 },
      { id: 'p2', title: 'Root note', kind: 'page', parentId: null, position: 1 },
      { id: 'f2', title: 'Nested', kind: 'folder', parentId: 'f1', position: 1 },
      { id: 'p3', title: 'Deep', kind: 'page', parentId: 'f2', position: 0 },
    ]);
    assert.equal(tree.length, 2);
    assert.equal(tree[0].title, 'Ops');
    assert.equal(tree[0].children.length, 2);
    assert.equal(tree[0].children[0].title, 'Runbook');
    assert.equal(tree[0].children[1].title, 'Nested');
    assert.equal(tree[0].children[1].children[0].title, 'Deep');
    assert.equal(tree[1].title, 'Root note');
  });
});
