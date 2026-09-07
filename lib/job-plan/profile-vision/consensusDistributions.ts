import { MAX_DISTRIBUTIONS } from './schema'
import {
  median,
  overlapSpan,
  snapToGrid,
  zoneClusters,
  type Grid,
  type SuccessfulRead,
  type TileRange,
  type Zone,
} from './consensus'
import type { ConsensusDistribution, ConsensusNode } from './types'

/**
 * Consensus over the DISTRIBUTIONS the samples reported (feat-147). Pure; the
 * same shape as the thin-zone consensus in `consensus.ts` — snap to the grid,
 * union a zone cut by a tile seam, cluster across samples by overlap + center,
 * keep clusters with agreement >= ceil(S/2) — plus what a distribution carries
 * that a thin zone does not: a median PEAK, the best RANK any sample gave it,
 * and links from its edges / peak to the consensus NODES they land on.
 *
 * The links are indices into the final `nodes` array (post-cap order). An edge
 * links to the nearest lvn whose band contains the price or whose center is
 * within the merge tolerance; the peak links to the nearest hvn the same way.
 * Null when nothing qualifies — a distribution the model named whose edge no
 * sample reported as an lvn is still kept (the zone is real), it just has no
 * node to point at.
 */

type DistributionZone = Zone & { readonly peak: number; readonly rank: number }

type Summarized = ConsensusDistribution & { readonly voters: ReadonlySet<number> }

function zonesOf(reads: readonly SuccessfulRead[], grid: Grid): DistributionZone[] {
  const out: DistributionZone[] = []
  for (const { sample, tile, read } of reads) {
    for (const d of read.distributions) {
      if (d.high < grid.priceLow || d.low > grid.priceHigh) continue
      out.push({
        sample,
        tile,
        low: snapToGrid(d.low, grid),
        high: snapToGrid(d.high, grid),
        peak: snapToGrid(d.peak, grid),
        rank: d.rank,
      })
    }
  }
  return out.sort(
    (a, b) => a.low - b.low || a.high - b.high || a.sample - b.sample || a.tile - b.tile
  )
}

/**
 * Within one sample, the same distribution seen in two tiles is one
 * distribution. Unlike thin zones, CONTACT is not evidence: adjacent auctions
 * share their boundary LVN by definition (`[low, sharedLVN]` next to
 * `[sharedLVN, high]`), so a pair merges only when the two reports overlap in
 * their INTERIOR and that overlap lies inside the tiles' shared span — the
 * signature of one zone cut by the seam, not two zones meeting at an edge.
 * (Codex P2 on the first cut, which merged on inclusive contact.)
 */
function dedupeDistributionTiles(
  zones: readonly DistributionZone[],
  tiles: readonly TileRange[]
): DistributionZone[] {
  if (tiles.length < 2) return [...zones]
  const kept: DistributionZone[] = []
  for (const z of zones) {
    const idx = kept.findIndex((k) => {
      if (k.sample !== z.sample || k.tile === z.tile) return false
      const span = overlapSpan(tiles, k.tile, z.tile)
      if (span === null) return false
      const low = Math.max(k.low, z.low, span.low)
      const high = Math.min(k.high, z.high, span.high)
      return low < high
    })
    if (idx === -1) kept.push(z)
    else kept[idx] = mergeTilePair(kept[idx], z)
  }
  return kept
}

/** A distribution cut by a tile seam: the union span, the better-ranked report's peak, the best rank. */
function mergeTilePair(keep: DistributionZone, dup: DistributionZone): DistributionZone {
  const better = dup.rank < keep.rank ? dup : keep
  return {
    ...keep,
    low: Math.min(keep.low, dup.low),
    high: Math.max(keep.high, dup.high),
    peak: better.peak,
    rank: Math.min(keep.rank, dup.rank),
  }
}

function summarize(cl: readonly DistributionZone[], grid: Grid, samples: number): Summarized {
  const low = snapToGrid(median(cl.map((z) => z.low)), grid)
  const high = snapToGrid(median(cl.map((z) => z.high)), grid)
  const voters = new Set(cl.map((z) => z.sample))
  const lo = Math.min(low, high)
  const hi = Math.max(low, high)
  // The median peak, clamped into the median zone so the invariant the schema
  // enforces per read (low <= peak <= high) survives the merge.
  const peak = Math.min(hi, Math.max(lo, snapToGrid(median(cl.map((z) => z.peak)), grid)))
  return {
    low: lo,
    high: hi,
    peak,
    rank: Math.min(...cl.map((z) => z.rank)),
    lowerEdgeNode: null,
    upperEdgeNode: null,
    peakNode: null,
    agreement: voters.size,
    samples,
    voters,
  }
}

/** Index of the nearest node of `kind` whose band holds `price` or whose center is within tolerance; null if none. */
export function nearestNodeIndex(
  nodes: readonly ConsensusNode[],
  price: number,
  kind: ConsensusNode['kind'],
  tolerance: number
): number | null {
  let best: number | null = null
  let bestDist = Infinity
  nodes.forEach((n, i) => {
    if (n.kind !== kind) return
    const center = (n.priceLow + n.priceHigh) / 2
    const inside = n.priceLow <= price && price <= n.priceHigh
    const dist = Math.abs(center - price)
    if (!inside && dist > tolerance) return
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  })
  return best
}

function linkNodes(
  d: ConsensusDistribution,
  nodes: readonly ConsensusNode[],
  tolerance: number
): ConsensusDistribution {
  return {
    ...d,
    lowerEdgeNode: nearestNodeIndex(nodes, d.low, 'lvn', tolerance),
    upperEdgeNode: nearestNodeIndex(nodes, d.high, 'lvn', tolerance),
    peakNode: nearestNodeIndex(nodes, d.peak, 'hvn', tolerance),
  }
}

/** Agreement first, then the better rank, then the wider zone — the cap keeps the ones most samples saw. */
function byStrength(a: Summarized, b: Summarized): number {
  return b.agreement - a.agreement || a.rank - b.rank || b.high - b.low - (a.high - a.low) || b.high - a.high
}

/** Output order: rank 1 first; equal ranks top-down. */
function byRank(a: ConsensusDistribution, b: ConsensusDistribution): number {
  return a.rank - b.rank || b.high - a.high
}

export function consensusDistributions(
  reads: readonly SuccessfulRead[],
  grid: Grid,
  tiles: readonly TileRange[],
  tolerance: number,
  threshold: number,
  samples: number,
  nodes: readonly ConsensusNode[]
): ConsensusDistribution[] {
  const zones = dedupeDistributionTiles(zonesOf(reads, grid), tiles)
  return zoneClusters(zones, tolerance)
    .map((cl) => summarize(cl, grid, samples))
    .filter((d) => d.agreement >= threshold)
    .sort(byStrength)
    .slice(0, MAX_DISTRIBUTIONS)
    .map(({ voters: _v, ...d }) => linkNodes(d, nodes, tolerance))
    .sort(byRank)
}
