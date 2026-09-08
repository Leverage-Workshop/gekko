import type { PlanFrame } from '@/knowledge/schema/job-plan.schema'
import type { BandSide, ConfluenceBand } from './contextTypes'
import type { PlayDirectional } from './planTypes'

/**
 * Where a band sits RELATIVE TO THE FRAME (feat-149, operator 2026-09-07 eve,
 * after the first bias-line plan wrote a counter-bias short above price and
 * nothing below the line): plays are read against the bias line, not against
 * price. With price ABOVE the line (bias long):
 *
 *   bias     between the line and price, price inside included — the
 *            pullback is bought on arrival (rebid)
 *   beyond   on the bias side but past price, not yet reached — two plays:
 *            the break-and-hold long ("price has to break it and hold to get
 *            in the trade") AND the counter-bias short on a FAIL there ("a
 *            JBA border overhead could also be a short" — trades at levels
 *            price hasn't reached are either a fail against the line's
 *            direction or a breach-and-hold with it; the fail is the only
 *            counter-bias play that exists, never a plain fade)
 *   line     the frame band itself — a rebid while price holds above it AND
 *            a reoffer once price loses it (both directions, drawn purple)
 *   far      beyond the line — the fork side: what to do once the line is
 *            lost, in the far side's direction, each level conditional on
 *            the last ("if price breaks the filter line, then another
 *            important level, a pullback to that level could be a play")
 *
 * Mirror image with price below the line. With the frame AT its band (no
 * bias yet) the read falls back to geometry against price, as before.
 */

export type FrameRelation = 'bias' | 'beyond' | 'line' | 'far'

/** How a play is shaped: the fade on arrival, or the hold after a break (in either direction). */
export type PlayShape = 'arrival' | 'continuation'

export type FrameRead = {
  readonly relation: FrameRelation
  /** Legal directions for a play at this band, in precedence order (the bias direction first). */
  readonly directions: readonly PlayDirectional[]
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
  band: Pick<ConfluenceBand, 'id' | 'low' | 'high'>,
  side: BandSide,
  frame: PlanFrame | null,
): FrameRead | null {
  const bias = biasDirection(frame)
  if (bias === null || frame === null) return null
  const fork = opposite(bias)
  if (frame.bandId === band.id) return { relation: 'line', directions: [bias, fork] }
  const frameLow = frame.low ?? frame.price
  const frameHigh = frame.high ?? frame.price
  // Beyond the line (the far side): entirely below a line price is above, or above a line price is below.
  const far = bias === 'long' ? band.high < frameLow : band.low > frameHigh
  if (far) return { relation: 'far', directions: [fork] }
  // Past price on the bias side: above price when the bias is long, below when short.
  const beyond = bias === 'long' ? side === 'above' : side === 'below'
  if (beyond) return { relation: 'beyond', directions: [bias, fork] }
  return { relation: 'bias', directions: [bias] }
}

/** Geometry against price (the pre-frame read, still used when the frame is at its band): below → long, above → short, inside → none. */
export function readAgainstPrice(side: BandSide): readonly PlayDirectional[] {
  if (side === 'below') return ['long']
  if (side === 'above') return ['short']
  return []
}

/** Legal directions for a band under a frame: the frame read when it has a direction, geometry otherwise. */
export function legalDirections(
  band: Pick<ConfluenceBand, 'id' | 'low' | 'high'>,
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
  if (read.relation === 'beyond') return direction === read.directions[0] ? 'continuation' : 'arrival'
  return 'continuation'
}

/** True for the counter-bias play at an unreached level beyond price — legal only as a look-and-fail, never a plain fade. */
export function isCounterBiasFail(read: FrameRead | null, direction: PlayDirectional): boolean {
  return read !== null && read.relation === 'beyond' && direction !== read.directions[0]
}

/** True when the play only comes alive once the line is lost (the line's fork direction, or the far side). */
export function isForkPlay(read: FrameRead | null, direction: PlayDirectional): boolean {
  if (read === null) return false
  if (read.relation === 'far') return true
  return read.relation === 'line' && direction !== read.directions[0]
}

/** The two sides of a directional frame the plan must address; both sides of price when the frame has no direction. */
export type FrameSideName = 'bias' | 'fork' | 'above' | 'below'

export function requiredSides(frame: PlanFrame | null): readonly FrameSideName[] {
  return biasDirection(frame) === null ? ['above', 'below'] : ['bias', 'fork']
}

/** Which required side a play at `band` in `direction` addresses. */
export function sideOfPlay(
  band: Pick<ConfluenceBand, 'id' | 'low' | 'high'>,
  side: BandSide,
  direction: PlayDirectional,
  frame: PlanFrame | null,
): FrameSideName | null {
  const read = readAgainstFrame(band, side, frame)
  if (read === null) return side === 'inside' ? null : side
  return isForkPlay(read, direction) ? 'fork' : 'bias'
}
