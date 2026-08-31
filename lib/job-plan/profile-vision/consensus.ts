import { R1_MERGE_TOLERANCE, type Instrument } from './instrument'
import {
  MAX_NODES,
  MAX_THIN_ZONES,
  NODE_KINDS,
  NODE_POSITIONS,
  NODE_EDGES,
  type NodeKind,
  type ProfileNode,
  type ProfileNodesRead,
} from './schema'
import type { ConsensusNode, ConsensusThinZone, ProfileConsensus } from './types'

/**
 * Consensus over S sampled vision reads of one profile (feat-123,
 * docs/job-planning-task-plan.md "Calls, parallelism, consensus"). Pure.
 *
 *   1. Snap every price to the profile grid; drop nodes with no overlap with
 *      the profile's span, clip the rest.
 *   2. De-duplicate tiles within a sample: the same node seen in two
 *      overlapping tiles is one node. Only nodes inside BOTH tiles' spans can
 *      be duplicates, and only when their bands intersect (or their centers
 *      sit within half the tolerance); the merge keeps the better prominence
 *      and OR-s the primary flag — never "first tile wins".
 *   3. Cluster across samples within the R1 merge tolerance (ES 5 / NQ 20),
 *      within a kind FAMILY: an lvn and its adjacent hvn-edge are two nodes
 *      by design (corpus B4) so they never merge; hvn-edge / hvn-core are
 *      alternate labels for one fat feature; exhaustive-node and taper-tail
 *      are DIFFERENT extreme anatomy and stay apart. One vote per sample per
 *      cluster — a same-sample collision opens a new cluster.
 *   4. Keep clusters with agreement >= ceil(S/2); price = median band,
 *      prominence = best, kind / position / shape / primary by majority.
 *   5. Exactly one primary lvn whenever any lvn survives: most primary votes,
 *      then agreement, then prominence; with no primary votes at all the
 *      strongest surviving lvn is promoted. At most MAX_NODES nodes, the
 *      primary always kept.
 *
 * Fewer than ceil(S/2) successful samples -> null (the caller emits the
 * `profile_nodes_unavailable` warning — R14, proceed with warning).
 */

export type SuccessfulRead = {
  readonly sample: number
  readonly tile: number
  readonly read: ProfileNodesRead
}

export type Grid = { readonly step: number; readonly priceLow: number; readonly priceHigh: number }

export type TileRange = {
  readonly index: number
  readonly priceLow: number
  readonly priceHigh: number
}

export type ConsensusInput = {
  readonly instrument: Instrument
  /** The rendered grid: effective row step and the full profile span (bin edges). */
  readonly grid: Grid
  /** Samples requested (S). */
  readonly samples: number
  /** The rendered tiles (T); a sample is successful only when every tile read succeeded. */
  readonly tiles: readonly TileRange[]
  readonly reads: readonly SuccessfulRead[]
}

type Family = 'lvn' | 'hvn' | 'exhaustive'

/** Kind families that may merge into one cluster. */
const FAMILY_OF: Readonly<Record<NodeKind, Family>> = {
  lvn: 'lvn',
  'hvn': 'hvn',
  'exhaustive-node': 'exhaustive',
}

type Candidate = {
  readonly sample: number
  readonly tile: number
  readonly node: ProfileNode
  readonly low: number
  readonly high: number
  readonly center: number
}

type Cluster = { readonly family: Family; readonly members: readonly Candidate[] }

export function requiredSamples(samples: number): number {
  return Math.ceil(samples / 2)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Snap a price to the grid and clamp it into the span. */
export function snapToGrid(price: number, grid: Grid): number {
  const snapped = grid.priceLow + Math.round((price - grid.priceLow) / grid.step) * grid.step
  return round4(Math.min(grid.priceHigh, Math.max(grid.priceLow, snapped)))
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Majority vote with a deterministic tie-break on the enum's declared order. */
function majority<T extends string>(votes: readonly T[], order: readonly T[]): T {
  const counts = new Map<T, number>()
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0])
  )[0][0]
}

/** Total order on candidates so clustering is permutation-invariant. */
function byCandidate(a: Candidate, b: Candidate): number {
  return (
    a.center - b.center ||
    a.sample - b.sample ||
    a.tile - b.tile ||
    NODE_KINDS.indexOf(a.node.kind) - NODE_KINDS.indexOf(b.node.kind) ||
    a.low - b.low ||
    a.high - b.high
  )
}

function toCandidates(reads: readonly SuccessfulRead[], grid: Grid): Candidate[] {
  const out: Candidate[] = []
  for (const { sample, tile, read } of reads) {
    for (const node of read.nodes) {
      if (node.priceHigh < grid.priceLow || node.priceLow > grid.priceHigh) continue
      const low = snapToGrid(node.priceLow, grid)
      const high = snapToGrid(node.priceHigh, grid)
      out.push({ sample, tile, node, low, high, center: (low + high) / 2 })
    }
  }
  return out.sort(byCandidate)
}

/** The price span two tiles share, or null when they do not overlap. */
function overlapSpan(
  tiles: readonly TileRange[],
  a: number,
  b: number
): { low: number; high: number } | null {
  const ta = tiles.find((t) => t.index === a)
  const tb = tiles.find((t) => t.index === b)
  if (!ta || !tb) return null
  const low = Math.max(ta.priceLow, tb.priceLow)
  const high = Math.min(ta.priceHigh, tb.priceHigh)
  return low < high ? { low, high } : null
}

type Band = { readonly low: number; readonly high: number }

/** The part of a band inside a span, or null when they do not meet. */
function clipToSpan(c: Band, span: Band): Band | null {
  const low = Math.max(c.low, span.low)
  const high = Math.min(c.high, span.high)
  return low <= high ? { low, high } : null
}

/** Two bands (already clipped to the shared span) describe one node when they intersect or sit within tolerance/2. */
function bandsMatch(a: Band, b: Band, tolerance: number): boolean {
  const intersect = a.low <= b.high && b.low <= a.high
  return intersect || Math.abs((a.low + a.high) / 2 - (b.low + b.high) / 2) <= tolerance / 2
}

/**
 * Merge a tile duplicate into its keeper. The band is the UNION of the two
 * reports (a node cut by the seam is reported clipped on each side, so the
 * union restores it); the better prominence carries the labels; primary is OR-ed.
 */
function mergeTilePair(keep: Candidate, dup: Candidate): Candidate {
  const better = dup.node.prominence < keep.node.prominence ? dup : keep
  const low = Math.min(keep.low, dup.low)
  const high = Math.max(keep.high, dup.high)
  return {
    ...better,
    low,
    high,
    center: (low + high) / 2,
    node: { ...better.node, primary: keep.node.primary || dup.node.primary },
  }
}

/**
 * Within one sample, the same node seen in two tiles is one node. Only a pair
 * whose bands both REACH the tiles' shared span and match inside it qualifies
 * — a node straddling the seam is a duplicate, two distinct features that
 * merely sit within the tolerance on different tiles are not.
 */
function dedupeTiles(
  candidates: readonly Candidate[],
  tiles: readonly TileRange[],
  tolerance: number
): Candidate[] {
  if (tiles.length < 2) return [...candidates]
  const kept: Candidate[] = []
  for (const c of candidates) {
    const idx = kept.findIndex((k) => {
      if (k.sample !== c.sample || k.tile === c.tile) return false
      if (FAMILY_OF[k.node.kind] !== FAMILY_OF[c.node.kind]) return false
      const span = overlapSpan(tiles, k.tile, c.tile)
      if (span === null) return false
      const kIn = clipToSpan(k, span)
      const cIn = clipToSpan(c, span)
      return kIn !== null && cIn !== null && bandsMatch(kIn, cIn, tolerance)
    })
    if (idx === -1) kept.push(c)
    else kept[idx] = mergeTilePair(kept[idx], c)
  }
  return kept
}

function clusterCenter(members: readonly Candidate[]): number {
  return median(members.map((m) => m.center))
}

/** Greedy single-linkage by center within a family; one member per sample per cluster. */
function cluster(candidates: readonly Candidate[], tolerance: number): Cluster[] {
  const clusters: Cluster[] = []
  for (const c of [...candidates].sort(byCandidate)) {
    const family = FAMILY_OF[c.node.kind]
    const idx = clusters.findIndex(
      (cl) =>
        cl.family === family &&
        Math.abs(clusterCenter(cl.members) - c.center) <= tolerance &&
        !cl.members.some((m) => m.sample === c.sample)
    )
    if (idx === -1) clusters.push({ family, members: [c] })
    else clusters[idx] = { family, members: [...clusters[idx].members, c] }
  }
  return clusters
}

type Scored = ConsensusNode & { readonly primaryVotes: number; readonly center: number }

function summarize(cl: Cluster, grid: Grid, samples: number): Scored {
  const m = cl.members
  const low = snapToGrid(median(m.map((x) => x.low)), grid)
  const high = snapToGrid(median(m.map((x) => x.high)), grid)
  const primaryVotes = m.filter((x) => x.node.primary).length
  return {
    kind: majority(
      m.map((x) => x.node.kind),
      NODE_KINDS
    ),
    priceLow: Math.min(low, high),
    priceHigh: Math.max(low, high),
    prominence: Math.min(...m.map((x) => x.node.prominence)),
    primary: primaryVotes * 2 > m.length,
    position: majority(
      m.map((x) => x.node.position),
      NODE_POSITIONS
    ),
    edgeBelow: majority(
      m.map((x) => x.node.edgeBelow),
      NODE_EDGES
    ),
    edgeAbove: majority(
      m.map((x) => x.node.edgeAbove),
      NODE_EDGES
    ),
    agreement: m.length,
    samples,
    primaryVotes,
    center: (low + high) / 2,
  }
}

function byPrimaryStrength(a: Scored, b: Scored): number {
  return (
    b.primaryVotes - a.primaryVotes ||
    b.agreement - a.agreement ||
    a.prominence - b.prominence ||
    a.center - b.center
  )
}

/**
 * Exactly one primary lvn whenever any lvn survives: the strongest candidate
 * by primary votes; with no votes at all (every sample's primary fell below
 * the agreement threshold) the strongest surviving lvn is promoted rather
 * than shipping lvns with no primary — the planner contract needs one.
 */
function resolvePrimary(nodes: readonly Scored[]): Scored[] {
  const lvns = nodes.filter((n) => n.kind === 'lvn').sort(byPrimaryStrength)
  const winner = lvns[0]
  return nodes.map((n) => ({ ...n, primary: n === winner }))
}

function byRank(a: Scored, b: Scored): number {
  return b.agreement - a.agreement || a.prominence - b.prominence || a.center - b.center
}

function capNodes(nodes: readonly Scored[]): Scored[] {
  const primary = nodes.find((n) => n.primary)
  const rest = nodes.filter((n) => n !== primary).sort(byRank)
  const kept = primary ? [primary, ...rest.slice(0, MAX_NODES - 1)] : rest.slice(0, MAX_NODES)
  return kept.sort((a, b) => b.center - a.center)
}

function stripScore(n: Scored): ConsensusNode {
  const { primaryVotes: _pv, center: _c, ...node } = n
  return node
}

type Zone = {
  readonly sample: number
  readonly tile: number
  readonly low: number
  readonly high: number
}

/** A consensus zone still carrying the samples behind it, until the final merge. */
type ZoneWithSamples = ConsensusThinZone & { readonly voters: ReadonlySet<number> }

function zonesOf(reads: readonly SuccessfulRead[], grid: Grid): Zone[] {
  const out: Zone[] = []
  for (const { sample, tile, read } of reads) {
    for (const z of read.thinZones) {
      if (z.high < grid.priceLow || z.low > grid.priceHigh) continue
      out.push({ sample, tile, low: snapToGrid(z.low, grid), high: snapToGrid(z.high, grid) })
    }
  }
  return out.sort(
    (a, b) => a.low - b.low || a.high - b.high || a.sample - b.sample || a.tile - b.tile
  )
}

/** Within one sample, zones from different tiles that touch are one zone (their union — a tile seam cuts zones). */
function dedupeZoneTiles(zones: readonly Zone[]): Zone[] {
  const kept: Zone[] = []
  for (const z of zones) {
    const idx = kept.findIndex(
      (k) => k.sample === z.sample && k.tile !== z.tile && z.low <= k.high && k.low <= z.high
    )
    if (idx === -1) kept.push(z)
    else
      kept[idx] = {
        ...kept[idx],
        low: Math.min(kept[idx].low, z.low),
        high: Math.max(kept[idx].high, z.high),
      }
  }
  return kept
}

function zoneClusters(zones: readonly Zone[], tolerance: number): Zone[][] {
  const clusters: Zone[][] = []
  for (const z of zones) {
    const idx = clusters.findIndex((cl) => {
      const lo = median(cl.map((x) => x.low))
      const hi = median(cl.map((x) => x.high))
      const overlaps = z.low <= hi + tolerance && z.high >= lo - tolerance
      const near = Math.abs((lo + hi) / 2 - (z.low + z.high) / 2) <= 2 * tolerance
      return overlaps && near && !cl.some((x) => x.sample === z.sample)
    })
    if (idx === -1) clusters.push([z])
    else clusters[idx] = [...clusters[idx], z]
  }
  return clusters
}

/** Two output zones that overlap are one zone: the union, agreed by the UNION of their samples. */
function mergeOverlappingZones(zones: readonly ZoneWithSamples[]): ZoneWithSamples[] {
  const out: ZoneWithSamples[] = []
  for (const z of [...zones].sort((a, b) => a.low - b.low || a.high - b.high)) {
    const last = out[out.length - 1]
    if (last && z.low <= last.high) {
      const voters = new Set([...last.voters, ...z.voters])
      out[out.length - 1] = {
        ...last,
        high: Math.max(last.high, z.high),
        voters,
        agreement: voters.size,
      }
    } else {
      out.push(z)
    }
  }
  return out
}

function consensusThinZones(
  reads: readonly SuccessfulRead[],
  grid: Grid,
  tolerance: number,
  threshold: number,
  samples: number
): ConsensusThinZone[] {
  const clusters = zoneClusters(dedupeZoneTiles(zonesOf(reads, grid)), tolerance)
  const zones: ZoneWithSamples[] = clusters
    .map((cl) => {
      const low = snapToGrid(median(cl.map((x) => x.low)), grid)
      const high = snapToGrid(median(cl.map((x) => x.high)), grid)
      const voters = new Set(cl.map((x) => x.sample))
      return {
        low: Math.min(low, high),
        high: Math.max(low, high),
        agreement: voters.size,
        samples,
        voters,
      }
    })
    .filter((z) => z.agreement >= threshold)
  return mergeOverlappingZones(zones)
    .sort(
      (a, b) => b.agreement - a.agreement || b.high - b.low - (a.high - a.low) || b.high - a.high
    )
    .slice(0, MAX_THIN_ZONES)
    .sort((a, b) => b.high - a.high)
    .map(({ voters: _v, ...zone }) => zone)
}

/** Samples whose every tile read succeeded. */
export function successfulSamples(
  reads: readonly SuccessfulRead[],
  tilesPerSample: number
): Set<number> {
  const tilesBySample = new Map<number, Set<number>>()
  for (const r of reads) {
    const tiles = tilesBySample.get(r.sample) ?? new Set<number>()
    tiles.add(r.tile)
    tilesBySample.set(r.sample, tiles)
  }
  return new Set(
    [...tilesBySample.entries()].filter(([, tiles]) => tiles.size >= tilesPerSample).map(([s]) => s)
  )
}

export function buildConsensus(input: ConsensusInput): ProfileConsensus | null {
  const threshold = requiredSamples(input.samples)
  const complete = successfulSamples(input.reads, input.tiles.length)
  if (complete.size < threshold) return null

  const reads = input.reads.filter((r) => complete.has(r.sample))
  const tolerance = R1_MERGE_TOLERANCE[input.instrument]
  const candidates = dedupeTiles(toCandidates(reads, input.grid), input.tiles, tolerance)
  const scored = cluster(candidates, tolerance)
    .map((cl) => summarize(cl, input.grid, input.samples))
    .filter((n) => n.agreement >= threshold)
  const nodes = capNodes(resolvePrimary(scored)).map(stripScore)


  return {
    nodes,
    thinZones: consensusThinZones(reads, input.grid, tolerance, threshold, input.samples),
    successfulSamples: complete.size,
    samples: input.samples,
  }
}

/** Exported for tests: the kind family a node clusters within. */
export function familyOf(kind: NodeKind): Family {
  return FAMILY_OF[kind]
}
