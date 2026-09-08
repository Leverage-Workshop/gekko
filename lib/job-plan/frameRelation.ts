import type { PlanFrame } from '@/knowledge/schema/job-plan.schema'
import type { BandSide, ConfluenceBand, DistributionEdge, Reference } from './contextTypes'
import type { PlayDirectional } from './planTypes'
import type { ReferenceSource } from './rules'

/**
 * Where a band sits RELATIVE TO THE FRAME (feat-149, operator 2026-09-07 eve,
 * after the first bias-line plan wrote a counter-bias short above price and
 * nothing below the line): plays are read against the bias line, not against
 * price. With price ABOVE the line (bias long):
 *
 *   bias     between the line and price, price inside included — the
 *            pullback is bought on arrival (rebid)
 *   beyond   on the bias side but past price, not yet reached — the
 *            break-and-hold long ("price has to break it and hold to get in
 *            the trade") AND, at a REAL important level only, the
 *            counter-bias short on a FAIL there ("a JBA border overhead could
 *            also be a short" — trades at levels price hasn't reached are
 *            either a fail against the line's direction or a breach-and-hold
 *            with it; the fail is the only counter-bias play, never a plain
 *            fade, and "generally you don't want to go against trend unless
 *            it's a real important level, like the edge of a JBA")
 *   line     the frame band itself — a rebid while price holds above it AND
 *            a reoffer once price loses it (both directions, drawn purple)
 *   far      beyond the line — the fork side: what to do once the line is
 *            lost, in the far side's direction, each level conditional on
 *            the last ("if price breaks the filter line, then another
 *            important level, a pullback to that level could be a play");
 *            at a real important level the operator's drawing also shows the
 *            bounce there (a fail against the new bias) — legal, fail only
 *
 * Mirror image with price below the line. With the frame AT its band (no
 * bias yet) the read falls back to geometry against price, as before.
 */

/**
 * Sources whose lone member makes a band "a real important level" — where a
 * counter-trend play is worth writing (feat-150, operator 2026-09-07 late:
 * "if they are allowed as trendline candidates, they are definitely
 * important enough to cause a countertrend trade"). Everything that can
 * ANCHOR the frame (`FRAME_ANCHOR_SOURCES`: pivots, the G line, JBA borders,
 * distribution boundary LVNs) plus the prior-day / overnight extremes.
 * Distribution edges are recognised on the member's NODE (an lvn bounding a
 * consensus distribution), not by source — a profile hvn or an interior lvn
 * is not important on its own.
 */
export const IMPORTANT_LEVEL_SOURCES: readonly ReferenceSource[] = [
  'jba-edge',
  'g-line',
  'weekly-job-pivot',
  'daily-job-pivot',
  'previous-day-extreme',
  'overnight-extreme',
]

export type FrameBand = Pick<ConfluenceBand, 'id' | 'low' | 'high' | 'confluence' | 'anchorSource' | 'members'>

const SOURCE_IMPORTANCE: Readonly<Record<string, string>> = {
  'jba-edge': 'a JBA border',
  'g-line': 'the G line',
  'weekly-job-pivot': 'the weekly Job Pivot',
  'daily-job-pivot': 'a daily Job Pivot',
  'previous-day-extreme': 'a prior-day extreme',
  'overnight-extreme': 'an overnight extreme',
}

const fmt = (n: number): string => String(Math.round(n * 100) / 100)

/** A distribution edge a member bounds, in words: "lower edge of the rank-2 balance-area distribution 29380–29722". */
export function distributionEdgeText(member: Reference, edge: DistributionEdge): string {
  const profile = member.node?.profile === 'rotation' ? '400-pt rotation' : 'balance-area'
  return `${edge.edge} edge of the rank-${edge.rank} ${profile} distribution ${fmt(edge.low)}–${fmt(edge.high)}`
}

/**
 * Why a band is a real important level, one reason per qualifying fact —
 * empty when it is not. Distribution edges come first (the operator's
 * 2026-09-07 example: a 5-reference stack on the lower edge of the day's
 * second distribution wrote a long-only plan), then the important sources,
 * then confluence.
 */
export function importantReasons(band: FrameBand): string[] {
  const edges = band.members.flatMap((m) => (m.node?.distributionEdges ?? []).map((e) => `${m.label} is the ${distributionEdgeText(m, e)}`))
  const sources = band.members.filter((m) => IMPORTANT_LEVEL_SOURCES.includes(m.source)).map((m) => `${m.label} is ${SOURCE_IMPORTANCE[m.source] ?? m.source}`)
  const stack = band.confluence ? [`${band.members.length} references stack into this band`] : []
  return [...edges, ...sources, ...stack]
}

/** A distribution boundary LVN, a JBA edge, a pivot, the G line, a prior-day / overnight extreme, or any stacked band. */
export function isImportantLevel(band: FrameBand): boolean {
  return importantReasons(band).length > 0
}

/**
 * At an important level that is also STACKED, beyond price on the bias side,
 * the counter-trend fail is the FIRST read, not the afterthought (operator:
 * "confluence of 5 different makes it a strong level, and more likely to
 * trigger a countertrend trade"). A lone important level keeps the
 * with-trend hold first.
 */
export function fadeFirst(band: FrameBand): boolean {
  return band.confluence && isImportantLevel(band)
}

export type FrameRelation = 'bias' | 'beyond' | 'line' | 'far'

/** How a play is shaped: the fade on arrival, or the hold after a break (in either direction). */
export type PlayShape = 'arrival' | 'continuation'

export type FrameRead = {
  readonly relation: FrameRelation
  /** Legal directions for a play at this band: the relation's PRIMARY direction first (the bias direction beyond price, the fork direction on the far side). */
  readonly directions: readonly PlayDirectional[]
  /** feat-150: at a stacked important level beyond price (bias side) the counter-trend fail ranks FIRST. */
  readonly fadeFirst: boolean
}

/** The bias direction a directional frame names, or null when the frame is absent or at its band. */
export function biasDirection(frame: PlanFrame | null): PlayDirectional | null {
  if (frame === null || frame.side === 'at') return null
  return frame.side === 'above' ? 'long' : 'short'
}

const opposite = (d: PlayDirectional): PlayDirectional => (d === 'long' ? 'short' : 'long')

/**
 * The band's relation to a DIRECTIONAL frame and the directions it may be
 * played in. Null when the frame has no direction (absent or 'at') — the
 * caller reads geometry against price instead.
 */
export function readAgainstFrame(
  band: FrameBand,
  side: BandSide,
  frame: PlanFrame | null,
): FrameRead | null {
  const bias = biasDirection(frame)
  if (bias === null || frame === null) return null
  const fork = opposite(bias)
  if (frame.bandId === band.id) return { relation: 'line', directions: [bias, fork], fadeFirst: false }
  const frameLow = frame.low ?? frame.price
  const frameHigh = frame.high ?? frame.price
  // Beyond the line (the far side): entirely below a line price is above, or above a line price is below.
  const counter = isImportantLevel(band)
  const first = counter && fadeFirst(band)
  const far = bias === 'long' ? band.high < frameLow : band.low > frameHigh
  // The far side keeps the fork hold first: the bounce there is a fail against a bias that does not exist yet.
  if (far) return { relation: 'far', directions: counter ? [fork, bias] : [fork], fadeFirst: false }
  // Past price on the bias side: above price when the bias is long, below when short.
  const beyond = bias === 'long' ? side === 'above' : side === 'below'
  if (beyond) return { relation: 'beyond', directions: counter ? [bias, fork] : [bias], fadeFirst: first }
  return { relation: 'bias', directions: [bias], fadeFirst: false }
}

/** Geometry against price (the pre-frame read, still used when the frame is at its band): below → long, above → short, inside → none. */
export function readAgainstPrice(side: BandSide): readonly PlayDirectional[] {
  if (side === 'below') return ['long']
  if (side === 'above') return ['short']
  return []
}

/** Legal directions for a band under a frame: the frame read when it has a direction, geometry otherwise. */
export function legalDirections(
  band: FrameBand,
  side: BandSide,
  frame: PlanFrame | null,
): readonly PlayDirectional[] {
  return readAgainstFrame(band, side, frame)?.directions ?? readAgainstPrice(side)
}

/**
 * The shape a play takes at a band in a direction: the fade on arrival, or
 * the hold after the break. At the line and beyond price the bias direction
 * and the counter direction take opposite shapes: the line is a fade while it
 * holds and a break-and-hold once lost; an unreached level beyond price is a
 * break-and-hold with the bias and a FAIL against it.
 */
export function playShape(read: FrameRead | null, direction: PlayDirectional): PlayShape {
  if (read === null || read.relation === 'bias') return 'arrival'
  if (read.relation === 'line') return direction === read.directions[0] ? 'arrival' : 'continuation'
  // beyond and far: the primary direction is the hold after the break; the other is the fail
  return direction === read.directions[0] ? 'continuation' : 'arrival'
}

/**
 * True when the play is the FIRST read at its band — with the trend on the
 * bias side, the fork direction beyond the line; at a stacked important level
 * the counter-trend fail instead (feat-150). Geometry reads are always primary.
 */
export function isPrimaryDirection(read: FrameRead | null, direction: PlayDirectional): boolean {
  if (read === null) return true
  const first = read.fadeFirst && read.directions.length > 1 ? read.directions[1] : read.directions[0]
  return direction === first
}

/** True for the counter-trend play at an unreached level (beyond price, or on the far side) — legal only as a look-and-fail, never a plain fade. */
export function isCounterBiasFail(read: FrameRead | null, direction: PlayDirectional): boolean {
  return read !== null && (read.relation === 'beyond' || read.relation === 'far') && direction !== read.directions[0]
}

/** True when the play only comes alive once the line is lost (the line's fork direction, or the far side). */
export function isForkPlay(read: FrameRead | null, direction: PlayDirectional): boolean {
  if (read === null) return false
  if (read.relation === 'far') return true
  return read.relation === 'line' && direction !== read.directions[0]
}

/** The side of the frame a play addresses: 'bias' while the line holds, 'fork' once it is lost; null with no frame direction. */
export function frameSideOf(read: FrameRead | null, direction: PlayDirectional): 'bias' | 'fork' | null {
  if (read === null) return null
  return isForkPlay(read, direction) ? 'fork' : 'bias'
}

/** The two sides of a directional frame the plan must address; both sides of price when the frame has no direction. */
export type FrameSideName = 'bias' | 'fork' | 'above' | 'below'

export function requiredSides(frame: PlanFrame | null): readonly FrameSideName[] {
  return biasDirection(frame) === null ? ['above', 'below'] : ['bias', 'fork']
}

/** Which required side a play at `band` in `direction` addresses. */
export function sideOfPlay(
  band: FrameBand,
  side: BandSide,
  direction: PlayDirectional,
  frame: PlanFrame | null,
): FrameSideName | null {
  const read = readAgainstFrame(band, side, frame)
  if (read === null) return side === 'inside' ? null : side
  return frameSideOf(read, direction)
}
