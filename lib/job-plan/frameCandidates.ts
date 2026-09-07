import type { ConfluenceBand, JobContext, Reference } from './contextTypes'
import { distanceToBand, r3AtBand, r4WithinReach, type ReferenceSource } from './rules'

/**
 * FRAME CANDIDATES (feat-148, operator ratification 2026-09-07).
 *
 * The frame is a BIAS LINE: above it the operator looks only for longs, below
 * it only for shorts, at whatever structure offers a rebid or reoffer on that
 * side. Positions never have to initiate at the line. So the candidates are
 * not "the most important line on the chart" but the structure price has
 * accepted beyond and can realistically re-cross today.
 *
 * ANCHOR LADDER (a candidate needs an anchor; lower tier = earlier in the ladder):
 *   0  the CURRENT daily Job Pivot — fresh at run time (runs happen after the
 *      RTH open), the line the session itself built; never a historical pivot
 *   1  the weekly Job Pivot and the G line at EQUAL rank — "rarely anywhere
 *      near price, but if they are they can come next"
 *   2  JBA borders: the borders of the box price is inside, or the nearest
 *      border below and above when price is between boxes ("structure
 *      precedes execution"; a JBA is a composite profile)
 *   3  balance-area profile: the boundary LVNs of the distribution price is
 *      in, or the nearest distribution edge below and above when price sits
 *      in an LVN gap between distributions (the primary LVN is an EDGE of a
 *      distribution, never inside one)
 *   4  400-pt rotation profile, the same rule — balance-area first
 *
 * CONFLUENCE-ONLY members never anchor but strengthen the band they sit in:
 * weekly rungs, ONH, ONL, PDH, PDL.
 *
 * Candidates are the confluence BANDS those anchors sit in (one candidate per
 * band, its best-tier anchor named), so "a collection of candidates around a
 * level" is one strong candidate rather than several weak ones. Reach is a
 * hard gate for every tier but the daily pivot: a bias line a full session
 * away fixes the bias for the whole day, which is no filter at all. Beyond
 * these gates the choice is judgment — the deterministic pick below is the
 * rollback path, the LLM planner picks with a rationale.
 */

export type FrameTier = 0 | 1 | 2 | 3 | 4

export const FRAME_TIER_NAMES: Readonly<Record<FrameTier, string>> = {
  0: 'current daily Job Pivot',
  1: 'weekly Job Pivot / G line',
  2: 'JBA border',
  3: 'balance-area distribution edge',
  4: '400-pt rotation distribution edge',
}

/** Sources that may ANCHOR a frame candidate, by tier. */
export const FRAME_ANCHOR_SOURCES: Readonly<Record<FrameTier, readonly ReferenceSource[]>> = {
  0: ['daily-job-pivot'],
  1: ['weekly-job-pivot', 'g-line'],
  2: ['jba-edge'],
  3: ['profile-balance'],
  4: ['profile-rotation'],
}

/** Sources that strengthen a candidate band but never anchor one. */
export const FRAME_CONFLUENCE_SOURCES: readonly ReferenceSource[] = ['weekly-rung', 'overnight-extreme', 'previous-day-extreme']

export type FrameAnchor = {
  readonly id: string
  readonly label: string
  readonly source: ReferenceSource
  readonly price: number
  readonly tier: FrameTier
  /** Why this reference is eligible ("current daily pivot", "lower border of the JBA price is in"). */
  readonly reason: string
}

export type FrameSide = 'above' | 'below' | 'at'

export type FrameCandidate = {
  /** The confluence band the anchor sits in — the id the planner answers with. */
  readonly bandId: string
  readonly low: number
  readonly high: number
  /** The best-tier anchor in the band (its price is the frame's `price`). */
  readonly anchorId: string
  readonly anchorLabel: string
  readonly anchorSource: ReferenceSource
  readonly anchorPrice: number
  readonly tier: FrameTier
  readonly tierName: string
  /** Every eligible anchor in the band, best tier first. */
  readonly anchors: readonly FrameAnchor[]
  /** Labels of the members that count toward confluence (anchors + confluence-only sources). */
  readonly confluenceLabels: readonly string[]
  readonly confluenceCount: number
  /** More than one counting member — a stacked band. */
  readonly stacked: boolean
  readonly side: FrameSide
  readonly distancePts: number
  readonly withinReach: boolean
  readonly reason: string
}

const round2 = (n: number): number => Math.round(n * 100) / 100

function tierOf(source: ReferenceSource): FrameTier | null {
  for (const tier of [0, 1, 2, 3, 4] as const) {
    if (FRAME_ANCHOR_SOURCES[tier].includes(source)) return tier
  }
  return null
}

function pivotAnchors(context: JobContext): FrameAnchor[] {
  return context.references
    .filter((r) => r.source === 'daily-job-pivot' && r.pivot?.role !== 'historical')
    .map((r) => ({ id: r.id, label: r.label, source: r.source, price: r.price, tier: 0 as const, reason: 'the current daily Job Pivot' }))
}

function weeklyAnchors(context: JobContext): FrameAnchor[] {
  return context.references
    .filter((r) => FRAME_ANCHOR_SOURCES[1].includes(r.source))
    .map((r) => ({ id: r.id, label: r.label, source: r.source, price: r.price, tier: 1 as const, reason: r.source === 'g-line' ? 'the G line (week open)' : 'the weekly Job Pivot' }))
}

/** JBA borders: both edges of every box price is inside; else the nearest border below and above. */
function boxAnchors(context: JobContext): FrameAnchor[] {
  const price = context.price.value
  const edges = context.references.filter((r) => r.source === 'jba-edge' && r.boxIndex !== null)
  const anchor = (r: Reference, reason: string): FrameAnchor => ({ id: r.id, label: r.label, source: r.source, price: r.price, tier: 2, reason })
  const inside = context.location.vsBoxes.filter((b) => b.side === 'inside').map((b) => b.boxIndex)
  if (inside.length > 0) {
    return edges
      .filter((r) => inside.includes(r.boxIndex as number))
      .map((r) => anchor(r, `${r.price < price ? 'lower' : 'upper'} border of the JBA price is inside`))
  }
  const below = edges.filter((r) => r.price < price).sort((a, b) => b.price - a.price)[0]
  const above = edges.filter((r) => r.price > price).sort((a, b) => a.price - b.price)[0]
  return [
    ...(below ? [anchor(below, 'the nearest JBA border below price')] : []),
    ...(above ? [anchor(above, 'the nearest JBA border above price')] : []),
  ]
}

/** Distribution edges of one profile: the edges of the distribution price is in; else the nearest edge below and above. */
function distributionAnchors(context: JobContext, source: 'profile-balance' | 'profile-rotation', tier: 3 | 4): FrameAnchor[] {
  const price = context.price.value
  const lvns = context.references.filter((r) => r.source === source && r.node?.kind === 'lvn' && (r.node.distributionEdges.length ?? 0) > 0)
  const anchor = (r: Reference, reason: string): FrameAnchor => ({ id: r.id, label: r.label, source: r.source, price: r.price, tier, reason })
  const enclosing = lvns.flatMap((r) =>
    (r.node?.distributionEdges ?? [])
      .filter((d) => d.low <= price && price <= d.high)
      .map((d) => anchor(r, `${d.edge} edge of the rank-${d.rank} distribution price is inside`)),
  )
  if (enclosing.length > 0) return dedupeById(enclosing)
  const below = lvns.filter((r) => r.price < price).sort((a, b) => b.price - a.price)[0]
  const above = lvns.filter((r) => r.price > price).sort((a, b) => a.price - b.price)[0]
  return [
    ...(below ? [anchor(below, 'the nearest distribution edge below price')] : []),
    ...(above ? [anchor(above, 'the nearest distribution edge above price')] : []),
  ]
}

function dedupeById(anchors: readonly FrameAnchor[]): FrameAnchor[] {
  const seen = new Set<string>()
  return anchors.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
}

/** Every reference eligible to anchor the frame, with its tier and why. */
export function frameAnchors(context: JobContext): FrameAnchor[] {
  return [
    ...pivotAnchors(context),
    ...weeklyAnchors(context),
    ...boxAnchors(context),
    ...distributionAnchors(context, 'profile-balance', 3),
    ...distributionAnchors(context, 'profile-rotation', 4),
  ].sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
}

/** A member counts toward confluence when it could anchor (any tier, current pivots, lvn nodes) or is a confluence-only source. */
function countsTowardConfluence(member: Reference): boolean {
  if (member.pivot?.role === 'historical') return false
  if (member.node && member.node.kind !== 'lvn') return false
  return tierOf(member.source) !== null || FRAME_CONFLUENCE_SOURCES.includes(member.source)
}

function sideOf(band: ConfluenceBand, context: JobContext): FrameSide {
  const price = context.price.value
  if (r3AtBand(price, band.low, band.high, context.tolerance.merge)) return 'at'
  return price > band.high ? 'above' : 'below'
}

function candidateFor(band: ConfluenceBand, anchors: readonly FrameAnchor[], context: JobContext): FrameCandidate {
  const best = anchors[0]
  const counting = band.members.filter(countsTowardConfluence)
  const distancePts = round2(distanceToBand(context.price.value, band.low, band.high))
  return {
    bandId: band.id,
    low: band.low,
    high: band.high,
    anchorId: best.id,
    anchorLabel: best.label,
    anchorSource: best.source,
    anchorPrice: best.price,
    tier: best.tier,
    tierName: FRAME_TIER_NAMES[best.tier],
    anchors,
    confluenceLabels: counting.map((m) => m.label),
    confluenceCount: counting.length,
    stacked: counting.length > 1,
    side: sideOf(band, context),
    distancePts,
    withinReach: r4WithinReach(distancePts, context.scale.reachPts),
    reason: best.reason,
  }
}

/** Stacked bands first, then the ladder, then proximity — the deterministic strength order. */
export function byFrameStrength(a: FrameCandidate, b: FrameCandidate): number {
  return Number(b.stacked) - Number(a.stacked) || a.tier - b.tier || a.distancePts - b.distancePts || a.bandId.localeCompare(b.bandId)
}

/** One candidate per band that holds an eligible anchor, strongest first. */
export function frameCandidates(context: JobContext): FrameCandidate[] {
  const anchors = frameAnchors(context)
  const anchorsByBand = new Map<string, FrameAnchor[]>()
  for (const band of context.bands) {
    const inBand = anchors.filter((a) => band.members.some((m) => m.id === a.id))
    if (inBand.length > 0) anchorsByBand.set(band.id, inBand)
  }
  return context.bands
    .filter((band) => anchorsByBand.has(band.id))
    .map((band) => candidateFor(band, anchorsByBand.get(band.id) as FrameAnchor[], context))
    .sort(byFrameStrength)
}

/**
 * The candidates the frame may legally come from: those within reach, the
 * daily pivot always; with nothing in reach at all, every candidate (the
 * nearest still frames the day, stated at its distance).
 */
export function eligibleFrameCandidates(candidates: readonly FrameCandidate[]): FrameCandidate[] {
  const inReach = candidates.filter((c) => c.withinReach || c.tier === 0)
  return inReach.length > 0 ? inReach : [...candidates]
}

/** The deterministic pick: the strongest eligible candidate, or null with no anchor in the inventory. */
export function selectFrameCandidate(context: JobContext): FrameCandidate | null {
  return eligibleFrameCandidates(frameCandidates(context)).sort(byFrameStrength)[0] ?? null
}
