import type { ConfluenceBand, Reference } from './contextTypes'
import { r1SameBand, r1WithinCap, r2NeverStacks, type BandTolerance } from './rules'

/**
 * Confluence bands (R1 / R1b, feat-126): references within one merge
 * tolerance chain TRANSITIVELY into a band (prior-day pivots and hvns never
 * chain — feat-153); a chain wider than the cap splits
 * at its largest internal gap (recursively) until every piece fits; each band
 * is quoted as [lowest member, highest member] and anchored on its
 * highest-significance ARMABLE member (destination-only members last, then
 * R2, then within-tier order, then profile
 * prominence, then closeness to the band's midpoint, then id — fully
 * deterministic). Plain points, per instrument.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100

function chain(sorted: readonly Reference[], merge: number): Reference[][] {
  const clusters: Reference[][] = []
  for (const reference of sorted) {
    const current = clusters.at(-1)
    if (current && r1SameBand(current[current.length - 1].price, reference.price, merge)) {
      current.push(reference)
    } else {
      clusters.push([reference])
    }
  }
  return clusters
}

/** Split at the largest internal gap (first such gap on a tie) until every piece is within the cap. */
function splitToCap(cluster: readonly Reference[], cap: number): Reference[][] {
  if (cluster.length < 2 || r1WithinCap(cluster[0].price, cluster[cluster.length - 1].price, cap)) {
    return [[...cluster]]
  }
  let splitAt = 1
  let largest = -Infinity
  for (let i = 1; i < cluster.length; i++) {
    const gap = cluster[i].price - cluster[i - 1].price
    if (gap > largest) {
      largest = gap
      splitAt = i
    }
  }
  return [...splitToCap(cluster.slice(0, splitAt), cap), ...splitToCap(cluster.slice(splitAt), cap)]
}

function prominenceOf(reference: Reference): number {
  return reference.node?.prominence ?? Number.POSITIVE_INFINITY
}

/**
 * Significance order inside a band: the first element is the anchor. A
 * destination-only member (rung, prior-day pivot, hvn — R2, feat-153) never
 * anchors a band that has an armable member: the band is named and ranked by
 * the level that can actually take the entry.
 */
export function orderBySignificance(members: readonly Reference[], midpoint: number): Reference[] {
  return [...members].sort(
    (a, b) =>
      Number(a.destinationOnly) - Number(b.destinationOnly) ||
      a.significance - b.significance ||
      a.subRank - b.subRank ||
      prominenceOf(a) - prominenceOf(b) ||
      Math.abs(a.price - midpoint) - Math.abs(b.price - midpoint) ||
      a.id.localeCompare(b.id),
  )
}

function toBand(members: readonly Reference[], index: number): ConfluenceBand {
  const low = Math.min(...members.map((m) => m.price))
  const high = Math.max(...members.map((m) => m.price))
  const ordered = orderBySignificance(members, (low + high) / 2)
  const anchor = ordered[0]
  const prominences = members.map(prominenceOf).filter(Number.isFinite)
  return {
    id: `band-${String(index + 1).padStart(2, '0')}`,
    low: round2(low),
    high: round2(high),
    anchorId: anchor.id,
    anchorPrice: anchor.price,
    anchorSource: anchor.source,
    significance: anchor.significance,
    members: ordered,
    memberCount: members.length,
    confluence: members.length > 1,
    destinationOnly: members.every((m) => m.destinationOnly),
    prominence: prominences.length > 0 ? Math.min(...prominences) : null,
  }
}

/** A prior-day pivot or an hvn never joins a band (R2, feat-153): it stands alone as a target. */
export function neverStacks(reference: Reference): boolean {
  return r2NeverStacks({ pivotRole: reference.pivot?.role ?? null, nodeKind: reference.node?.kind ?? null })
}

const byPrice = (a: Reference, b: Reference): number => a.price - b.price || a.id.localeCompare(b.id)

/**
 * Bands low → high, ids `band-01`… in that order. Never-stacking references
 * (prior-day pivots, hvns) are kept OUT of the chaining — each is its own
 * single-member band, so it never widens, anchors, or strengthens a level;
 * an armable band on either side of one is not bridged through it.
 */
export function buildConfluenceBands(
  references: readonly Reference[],
  tolerance: BandTolerance,
): ConfluenceBand[] {
  const stacking = references.filter((r) => !neverStacks(r)).sort(byPrice)
  const standalone = references.filter(neverStacks).map((r) => [r])
  const clusters = chain(stacking, tolerance.merge).flatMap((cluster) => splitToCap(cluster, tolerance.cap))
  return [...clusters, ...standalone]
    .sort((a, b) => Math.min(...a.map((m) => m.price)) - Math.min(...b.map((m) => m.price)) || a[0].id.localeCompare(b[0].id))
    .map(toBand)
}
