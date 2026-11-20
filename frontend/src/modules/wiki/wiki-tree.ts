import type { WikiPage } from './wiki.api'

export interface WikiTreeNode extends WikiPage {
  children: WikiTreeNode[]
}

/** Build a nested folder tree from a flat wiki list (root parentId = null). */
export function buildWikiTree(pages: WikiPage[]): WikiTreeNode[] {
  const byParent = new Map<string | null, WikiPage[]>()
  for (const page of pages) {
    const key = page.parentId ?? null
    const list = byParent.get(key) ?? []
    list.push(page)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) =>
        (a.position ?? 0) - (b.position ?? 0) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }),
    )
  }
  function nest(parentId: string | null): WikiTreeNode[] {
    return (byParent.get(parentId) ?? []).map((page) => ({
      ...page,
      children: page.kind === 'folder' ? nest(page.id) : [],
    }))
  }
  return nest(null)
}

export function wikiFolders(pages: WikiPage[]) {
  return pages.filter((page) => page.kind === 'folder').sort((a, b) => a.title.localeCompare(b.title))
}
