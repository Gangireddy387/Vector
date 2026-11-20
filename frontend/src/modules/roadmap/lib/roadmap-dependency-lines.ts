/**
 * Finish→start dependency connectors for the roadmap Gantt (pure geometry).
 * `from` = blocker, `to` = blocked (matches DependencyEdge).
 */

export interface DependencyLineEdge {
  id: string
  from: string
  to: string
}

export interface DependencyBarBox {
  left: number
  width: number
  rowIndex: number
}

export interface DependencyLine {
  id: string
  from: string
  to: string
  fromKey: string
  toKey: string
  d: string
  critical: boolean
  cycle: boolean
  /** Midpoint for hit-testing / label placement. */
  midX: number
  midY: number
}

export function cycleEdgeKeys(cycles: string[][]): Set<string> {
  const keys = new Set<string>()
  for (const cycle of cycles) {
    for (let i = 0; i < cycle.length; i += 1) {
      const a = cycle[i]
      const b = cycle[(i + 1) % cycle.length]
      if (a && b) keys.add(`${a}->${b}`)
    }
  }
  return keys
}

function cubicPath(x1: number, y1: number, x2: number, y2: number, lane = 0): string {
  const midX = (x1 + x2) / 2 + lane * 10
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`
}

/**
 * Build SVG path descriptors for visible FS dependency lines.
 * Skips edges where either end lacks a bar box (undated / collapsed / filtered out).
 */
export function buildDependencyLines(options: {
  edges: DependencyLineEdge[]
  bars: Map<string, DependencyBarBox>
  rowHeight: number
  criticalIds?: Iterable<string>
  cycleKeys?: Set<string>
  issueKeys?: Map<string, string>
}): DependencyLine[] {
  const critical = new Set(options.criticalIds ?? [])
  const cycleKeys = options.cycleKeys ?? new Set<string>()
  const issueKeys = options.issueKeys ?? new Map<string, string>()
  const lines: DependencyLine[] = []
  let laneCounter = 0

  for (const edge of options.edges) {
    const fromBar = options.bars.get(edge.from)
    const toBar = options.bars.get(edge.to)
    if (!fromBar || !toBar) continue

    const y1 = fromBar.rowIndex * options.rowHeight + options.rowHeight / 2
    const y2 = toBar.rowIndex * options.rowHeight + options.rowHeight / 2
    const x1 = fromBar.left + fromBar.width
    const x2 = toBar.left
    const lane = fromBar.rowIndex === toBar.rowIndex ? ((laneCounter++ % 5) - 2) : 0
    const d = cubicPath(x1, y1, x2, y2, lane)
    const criticalEdge = critical.has(edge.from) && critical.has(edge.to)
    const cycle = cycleKeys.has(`${edge.from}->${edge.to}`)

    lines.push({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      fromKey: issueKeys.get(edge.from) ?? edge.from.slice(0, 8),
      toKey: issueKeys.get(edge.to) ?? edge.to.slice(0, 8),
      d,
      critical: criticalEdge,
      cycle,
      midX: (x1 + x2) / 2,
      midY: (y1 + y2) / 2,
    })
  }

  return lines
}
