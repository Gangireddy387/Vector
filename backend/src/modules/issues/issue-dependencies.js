/**
 * Builds a blocks-link dependency graph and finds the critical path (longest unfinished chain).
 * Pure functions — safe to unit-test without a database.
 */

const DEFAULT_MINUTES = 480; // 1 working day when nothing is estimated
const MINUTES_PER_POINT = 240; // 4 hours per story point

/** Estimated effort in minutes for scheduling / critical-path length. */
export function issueEffortMinutes(issue) {
  if (Number.isFinite(issue.estimateMinutes) && issue.estimateMinutes > 0) return issue.estimateMinutes;
  if (Number.isFinite(issue.storyPoints) && issue.storyPoints > 0) return issue.storyPoints * MINUTES_PER_POINT;
  return DEFAULT_MINUTES;
}

function isOpen(issue) {
  return issue.statusCategory !== 'done';
}

/**
 * @param {{ issues: Array<object>, links: Array<{ id: string, sourceIssueId: string, targetIssueId: string, type: string }> }} input
 * `links` where type === 'blocks' mean source blocks target (source must finish first).
 */
export function buildDependencyGraph({ issues, links }) {
  const byId = new Map(issues.map((issue) => [issue.id, issue]));
  const blockEdges = links
    .filter((link) => link.type === 'blocks' && byId.has(link.sourceIssueId) && byId.has(link.targetIssueId))
    .map((link) => ({
      id: link.id,
      from: link.sourceIssueId,
      to: link.targetIssueId,
      type: 'blocks',
    }));

  const blockersOf = new Map(); // issueId -> ids that block it
  const blockedBy = new Map(); // issueId -> ids it blocks
  for (const issue of issues) {
    blockersOf.set(issue.id, []);
    blockedBy.set(issue.id, []);
  }
  for (const edge of blockEdges) {
    blockersOf.get(edge.to).push(edge.from);
    blockedBy.get(edge.from).push(edge.to);
  }

  const cycles = findCycles(issues.map((issue) => issue.id), blockedBy);

  const openIssues = issues.filter(isOpen);
  const openIds = new Set(openIssues.map((issue) => issue.id));
  // Drop edges that participate in a cycle so longest-path stays a DAG.
  const openEdges = blockEdges.filter(
    (edge) => openIds.has(edge.from) && openIds.has(edge.to) && !cycles.edgeKeys.has(`${edge.from}->${edge.to}`),
  );

  const { path: criticalPathIds, lengthMinutes } = longestPath(
    openIssues.map((issue) => issue.id),
    openEdges,
    (id) => issueEffortMinutes(byId.get(id)),
  );

  const onCriticalPath = new Set(criticalPathIds);
  const layers = computeLayers(
    [...openIds],
    openEdges.filter((edge) => !cycles.edgeKeys.has(`${edge.from}->${edge.to}`)),
  );

  const blockedNow = openIssues
    .filter((issue) => (blockersOf.get(issue.id) ?? []).some((blockerId) => openIds.has(blockerId)))
    .map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      waitingOn: (blockersOf.get(issue.id) ?? [])
        .filter((blockerId) => openIds.has(blockerId))
        .map((blockerId) => {
          const blocker = byId.get(blockerId);
          return { id: blocker.id, key: blocker.key, title: blocker.title };
        }),
    }));

  const involvedIds = new Set([
    ...blockEdges.flatMap((edge) => [edge.from, edge.to]),
    ...criticalPathIds,
  ]);

  const nodes = issues
    .filter((issue) => involvedIds.has(issue.id))
    .map((issue) => ({
      id: issue.id,
      key: issue.key,
      title: issue.title,
      type: issue.type,
      priority: issue.priority,
      statusCategory: issue.statusCategory,
      statusName: issue.statusName ?? null,
      assignee: issue.assignee ?? null,
      estimateMinutes: issue.estimateMinutes ?? null,
      storyPoints: issue.storyPoints ?? null,
      effortMinutes: issueEffortMinutes(issue),
      done: !isOpen(issue),
      onCriticalPath: onCriticalPath.has(issue.id),
      layer: layers.get(issue.id) ?? 0,
      blockedByOpen: (blockersOf.get(issue.id) ?? []).filter((id) => openIds.has(id)).length,
    }));

  return {
    nodes,
    edges: blockEdges,
    criticalPath: {
      issueIds: criticalPathIds,
      lengthMinutes,
      issues: criticalPathIds.map((id) => {
        const issue = byId.get(id);
        return { id, key: issue.key, title: issue.title, effortMinutes: issueEffortMinutes(issue) };
      }),
    },
    blockedNow,
    cycles: cycles.paths,
    stats: {
      linkedIssues: nodes.length,
      blockLinks: blockEdges.length,
      openBlocked: blockedNow.length,
      criticalPathLength: criticalPathIds.length,
      cycleCount: cycles.paths.length,
    },
  };
}

function findCycles(ids, blockedBy) {
  const color = new Map(ids.map((id) => [id, 0]));
  const stack = [];
  const paths = [];
  const edgeKeys = new Set();

  function dfs(id) {
    color.set(id, 1);
    stack.push(id);
    for (const next of blockedBy.get(id) ?? []) {
      const state = color.get(next);
      if (state === 1) {
        const start = stack.indexOf(next);
        const path = stack.slice(start).concat(next);
        paths.push(path);
        for (let i = 0; i < path.length - 1; i += 1) edgeKeys.add(`${path[i]}->${path[i + 1]}`);
      } else if (state === 0) {
        dfs(next);
      }
    }
    stack.pop();
    color.set(id, 2);
  }

  for (const id of ids) if (color.get(id) === 0) dfs(id);
  return { paths, edgeKeys };
}

/** Longest path in a DAG of open block edges; skips edges that participate in cycles. */
function longestPath(ids, edges, weightOf) {
  const outgoing = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    if (!outgoing.has(edge.from) || !outgoing.has(edge.to)) continue;
    outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  // Cycle leftovers — ignore them for critical path.
  if (order.length !== ids.length) {
    const ordered = new Set(order);
    for (const id of ids) if (!ordered.has(id)) order.push(id);
  }

  const dist = new Map(ids.map((id) => [id, weightOf(id)]));
  const prev = new Map(ids.map((id) => [id, null]));
  for (const id of order) {
    for (const next of outgoing.get(id) ?? []) {
      const candidate = dist.get(id) + weightOf(next);
      if (candidate > dist.get(next)) {
        dist.set(next, candidate);
        prev.set(next, id);
      }
    }
  }

  if (!edges.length) return { path: [], lengthMinutes: 0 };

  let end = null;
  let best = -1;
  for (const id of ids) {
    // Prefer ends of real chains (have a predecessor) over isolated nodes.
    if (dist.get(id) > best && (prev.get(id) || outgoing.get(id)?.length)) {
      best = dist.get(id);
      end = id;
    }
  }
  if (end == null) {
    for (const id of ids) {
      if (dist.get(id) > best) {
        best = dist.get(id);
        end = id;
      }
    }
  }
  if (end == null || best <= 0) return { path: [], lengthMinutes: 0 };

  const path = [];
  const seen = new Set();
  for (let id = end; id; id = prev.get(id)) {
    if (seen.has(id)) break;
    seen.add(id);
    path.push(id);
  }
  path.reverse();
  // A single isolated node is not a dependency path.
  if (path.length < 2) return { path: [], lengthMinutes: 0 };
  return { path, lengthMinutes: best };
}

/** Layer 0 = no open blockers; each next layer waits on a previous one. */
function computeLayers(ids, edges) {
  const blockers = new Map(ids.map((id) => [id, []]));
  for (const edge of edges) {
    if (!blockers.has(edge.to)) continue;
    blockers.get(edge.to).push(edge.from);
  }
  const layer = new Map();
  const visiting = new Set();

  function depth(id) {
    if (layer.has(id)) return layer.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = blockers.get(id) ?? [];
    const value = parents.length ? 1 + Math.max(...parents.map(depth)) : 0;
    visiting.delete(id);
    layer.set(id, value);
    return value;
  }

  for (const id of ids) depth(id);
  return layer;
}
