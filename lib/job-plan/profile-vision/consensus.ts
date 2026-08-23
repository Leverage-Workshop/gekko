import { R1_MERGE_TOLERANCE, type Instrument } from './instrument'
import {
  MAX_NODES,
  MAX_THIN_ZONES,
  NODE_KINDS,
  NODE_POSITIONS,
  NODE_SHAPES,
  PROFILE_SHAPES,
  type NodeKind,
  type ProfileNode,
  type ProfileNodesRead,
  type ProfileShape,
} from './schema'
import type { ConsensusNode, ConsensusThinZone, ProfileConsensus } from './types'

/**
 * Consensus over S sampled vision reads of one profile (feat-123,
 * docs/job-planning-task-plan.md "Calls, parallelism, consensus"). Pure.
 *
 *   1. Snap every price to the profile grid; drop nodes with no overlap with
 *      the profile's span, clip the rest.
 *   2. De-duplicate tiles within a sample: the same node seen in two overlapping
 *      tiles is one node.
 *   3. Cluster across samples within the R1 merge tolerance (ES 5 / NQ 20),
 *      within a kind FAMILY (an lvn and its adjacent hvn-edge are two nodes by
 *      design — corpus B4 — so they must never merge). One vote per sample per
 *      cluster.
 *   4. Keep clusters with agreement >= ceil(S/2); price = median band,
 *      prominence = best, kind / position / shape / primary by majority.
 *   5. Exactly one primary lvn survives (most primary votes, then agreement,
 *      then prominence); at most MAX_NODES nodes, the primary always kept.
 *
 * Fewer than ceil(S/2) successful samples -> null (the caller emits the
 * `profile_nodes_unavailable` warning — R14, proceed with warning).
 */

export type SuccessfulRead = {
  readonly sample: number
  readonly tile: number
  readonly read: ProfileNodesRead
}

export type ConsensusInput = {
  readonly instrument: Instrument
  /** The rendered grid: effective row step and the full profile span (bin edges). */
  readonly grid: { readonly step: number; readonly priceLow: number; readonly priceHigh: number }
  /** Samples requested (S). */
  readonly samples: number
  /** Tiles each sample consists of (T); a sample is successful only when every tile read succeeded. */
  readonly tilesPerSample: number
  readonly reads: readonly SuccessfulRead[]
}

/** Kind families that may merge into one cluster. */
const FAMILY_OF: Readonly<Record<NodeKind, 'thin' | 'fat' | 'extreme'>> = {
  lvn: 'thin',
  'hvn-edge': 'fat',
  'hvn-core': 'fat',
  'exhaustive-node': 'extreme',
  'taper-tail': 'extreme',
}

type Candidate = {
  readonly sample: number
  readonly tile: number
  readonly node: ProfileNode
  readonly low: number
  readonly high: number
  readonly center: number
}

type Cluster = {
  readonly family: 'thin' | 'fat' | 'extreme'
  readonly members: readonly Candidate[]
}

export function requiredSamples(samples: number): number {
  return Math.ceil(samples / 2)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Snap a price to the grid and clamp it into the span. */
export function snapToGrid(price: number, grid: ConsensusInput['grid']): number {
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

function toCandidates(reads: readonly SuccessfulRead[], grid: ConsensusInput['grid']): Candidate[] {
  const out: Candidate[] = []
  for (const { sample, tile, read } of reads) {
    for (const node of read.nodes) {
      if (node.priceHigh < grid.priceLow || node.priceLow > grid.priceHigh) continue
      const low = snapToGrid(node.priceLow, grid)
      const high = snapToGrid(node.priceHigh, grid)
      out.push({ sample, tile, node, low, high, center: (low + high) / 2 })
    }
  }
  return out
}

/** Within one sample, the same node seen in two tiles is one node (first tile wins). */
function dedupeTiles(candidates: readonly Candidate[], tolerance: number): Candidate[] {
  const kept: Candidate[] = []
  for (const c of [...candidates].sort(
    (a, b) => a.sample - b.sample || a.tile - b.tile || a.center - b.center
  )) {
    const duplicate = kept.some(
      (k) =>
        k.sample === c.sample &&
        k.tile !== c.tile &&
        FAMILY_OF[k.node.kind] === FAMILY_OF[c.node.kind] &&
        Math.abs(k.center - c.center) <= tolerance
    )
    if (!duplicate) kept.push(c)
  }
  return kept
}

function clusterCenter(members: readonly Candidate[]): number {
  return median(members.map((m) => m.center))
}

/** Greedy single-linkage by center within a family; one member per sample per cluster. */
function cluster(candidates: readonly Candidate[], tolerance: number): Cluster[] {
  const sorted = [...candidates].sort((a, b) => a.center - b.center || a.sample - b.sample)
  const clusters: Cluster[] = []
  for (const c of sorted) {
    const family = FAMILY_OF[c.node.kind]
    const idx = clusters.findIndex(
      (cl) =>
        cl.family === family &&
        Math.abs(clusterCenter(cl.members) - c.center) <= tolerance &&
        !cl.members.some((m) => m.sample === c.sample)
    )
    if (idx === -1) {
      clusters.push({ family, members: [c] })
    } else {
      clusters[idx] = { family, members: [...clusters[idx].members, c] }
    }
  }
  return clusters
}

type Scored = ConsensusNode & { readonly primaryVotes: number; readonly center: number }

function summarize(cl: Cluster, grid: ConsensusInput['grid'], samples: number): Scored {
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
    shape: majority(
      m.map((x) => x.node.shape),
      NODE_SHAPES
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

/** Exactly one primary lvn: the strongest candidate that received at least one primary vote. */
function resolvePrimary(nodes: readonly Scored[]): Scored[] {
  const lvns = nodes.filter((n) => n.kind === 'lvn' && n.primaryVotes > 0).sort(byPrimaryStrength)
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

type ZoneCandidate = { readonly sample: number; readonly low: number; readonly high: number }

function consensusThinZones(
  reads: readonly SuccessfulRead[],
  grid: ConsensusInput['grid'],
  tolerance: number,
  threshold: number,
  samples: number
): ConsensusThinZone[] {
  const candidates: ZoneCandidate[] = []
  for (const { sample, read } of reads) {
    for (const z of read.thinZones) {
      if (z.high < grid.priceLow || z.low > grid.priceHigh) continue
      candidates.push({ sample, low: snapToGrid(z.low, grid), high: snapToGrid(z.high, grid) })
    }
  }
  const clusters: ZoneCandidate[][] = []
  for (const c of candidates.sort(
    (a, b) => a.low + a.high - (b.low + b.high) || a.sample - b.sample
  )) {
    const center = (c.low + c.high) / 2
    const idx = clusters.findIndex((cl) => {
      const lo = median(cl.map((x) => x.low))
      const hi = median(cl.map((x) => x.high))
      const overlaps = c.low <= hi + tolerance && c.high >= lo - tolerance
      return (
        overlaps &&
        Math.abs((lo + hi) / 2 - center) <= 2 * tolerance &&
        !cl.some((x) => x.sample === c.sample)
      )
    })
    if (idx === -1) clusters.push([c])
    else clusters[idx] = [...clusters[idx], c]
  }
  return clusters
    .map((cl) => {
      const seen = new Set(cl.map((x) => x.sample))
      const low = snapToGrid(median(cl.map((x) => x.low)), grid)
      const high = snapToGrid(median(cl.map((x) => x.high)), grid)
      return {
        low: Math.min(low, high),
        high: Math.max(low, high),
        agreement: seen.size,
        samples,
      }
    })
    .filter((z) => z.agreement >= threshold)
    .sort(
      (a, b) => b.agreement - a.agreement || b.high - b.low - (a.high - a.low) || b.high - a.high
    )
    .slice(0, MAX_THIN_ZONES)
    .sort((a, b) => b.high - a.high)
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
  const complete = successfulSamples(input.reads, input.tilesPerSample)
  if (complete.size < threshold) return null

  const reads = input.reads.filter((r) => complete.has(r.sample))
  const tolerance = R1_MERGE_TOLERANCE[input.instrument]
  const candidates = dedupeTiles(toCandidates(reads, input.grid), tolerance)
  const scored = cluster(candidates, tolerance)
    .map((cl) => summarize(cl, input.grid, input.samples))
    .filter((n) => n.agreement >= threshold)
  const nodes = capNodes(resolvePrimary(scored)).map(stripScore)

  const shapes = reads.map((r) => r.read.profileShape)
  const unfinishedVotes = reads.filter((r) => r.read.unfinished).length

  return {
    nodes,
    thinZones: consensusThinZones(reads, input.grid, tolerance, threshold, input.samples),
    profileShape: majority<ProfileShape>(shapes, PROFILE_SHAPES),
    unfinished: unfinishedVotes * 2 > reads.length,
    successfulSamples: complete.size,
    samples: input.samples,
  }
}

/** Exported for tests: the kind family a node clusters within. */
export function familyOf(kind: NodeKind): 'thin' | 'fat' | 'extreme' {
  return FAMILY_OF[kind]
}
