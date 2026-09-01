import type { JobContext } from '../contextTypes'
import { FRAME_LADDER } from '../planFrame'
import type { LlmPlanJudgment } from './schema'

/**
 * The hard gates the ratified proposal keeps code-side (feat-144,
 * docs/job-plan-llm-planner-proposal.md "Judgment granted vs. invariants
 * kept"). Everything here is mechanical — a violation is a contract break,
 * not a judgment disagreement — and `runLlmPlanner` retries ONCE with the
 * violations spelled out before recording them.
 *
 * What is deliberately NOT checked: which band the model picked within a side,
 * ranking order, reach (guidance, not a wall), whether stand-down was declared
 * for a mid-zone context. Those are the experiment.
 */

export type JudgmentViolationCode =
  | 'frame_unknown_reference'
  | 'frame_not_tier_one'
  | 'frame_historical_pivot'
  | 'play_unknown_band'
  | 'play_duplicate_band'
  | 'play_destination_only'
  | 'play_direction_geometry'
  | 'play_inside_without_frame_direction'
  | 'side_unaddressed'
  | 'stand_down_without_text'
  | 'invented_price'

export type JudgmentViolation = {
  readonly code: JudgmentViolationCode
  readonly message: string
}

/** Matches standalone numbers (optionally comma-grouped) — not digits embedded in a word like "1A". */
const NUMBER_RE = /(?<![\w.])\d[\d,]*(?:\.\d+)?(?!\w)/g

/** Same epsilon the JobPlan schema uses for inventory-price membership. */
const PRICE_EPSILON = 0.005

function knownPrices(context: JobContext): number[] {
  const prices = new Set<number>([context.price.value])
  for (const r of context.references) {
    prices.add(r.price)
    prices.add(r.priceLow)
    prices.add(r.priceHigh)
  }
  for (const b of context.bands) {
    prices.add(b.low)
    prices.add(b.high)
  }
  const zone = context.location.enclosingZone
  if (zone !== null) {
    prices.add(zone.lowerEdge.price)
    prices.add(zone.upperEdge.price)
  }
  return [...prices]
}

/**
 * Numbers in model-authored prose at price magnitude that match no supplied
 * price. Anything at or above the inventory's floor is a price claim — inside
 * the span OR beyond it ("toward 21000" above a 20500 top is still invented).
 * Legitimate non-price numerics (point distances, minutes, sigma multiples)
 * live orders of magnitude below an NQ/ES price, under the floor.
 */
export function inventedPrices(judgment: LlmPlanJudgment, context: JobContext): number[] {
  const known = knownPrices(context)
  const lo = Math.min(...known) - context.tolerance.cap
  const prose = [
    judgment.frame.rationale,
    judgment.lean,
    judgment.standDownText ?? '',
    ...judgment.plays.flatMap((p) => [p.text, p.rationale]),
    ...judgment.sidesWithoutPlay.map((s) => s.reason),
  ].join('\n')
  const invented = new Set<number>()
  for (const match of prose.matchAll(NUMBER_RE)) {
    const value = Number(match[0].replace(/,/g, ''))
    if (!Number.isFinite(value) || value < lo) continue
    if (!known.some((k) => Math.abs(k - value) < PRICE_EPSILON)) invented.add(value)
  }
  return [...invented]
}

/** Which side of the judged frame line price sits on ('at' within one merge tolerance). */
export function judgedFrameSide(context: JobContext, frameReferenceId: string): 'above' | 'below' | 'at' | null {
  const ref = context.references.find((r) => r.id === frameReferenceId)
  if (!ref) return null
  const distance = Math.abs(context.price.value - ref.price)
  if (distance <= context.tolerance.merge) return 'at'
  return context.price.value > ref.price ? 'above' : 'below'
}

export function validateJudgment(judgment: LlmPlanJudgment, context: JobContext): JudgmentViolation[] {
  const violations: JudgmentViolation[] = []
  const add = (code: JudgmentViolationCode, message: string) => violations.push({ code, message })

  const frameRef = context.references.find((r) => r.id === judgment.frame.referenceId)
  if (!frameRef) {
    add('frame_unknown_reference', `frame.referenceId "${judgment.frame.referenceId}" is not in the inventory`)
  } else {
    if (!FRAME_LADDER.includes(frameRef.source)) {
      add('frame_not_tier_one', `frame reference ${frameRef.label} (${frameRef.source}) is not a tier-one line`)
    }
    if (frameRef.pivot?.role === 'historical') {
      add('frame_historical_pivot', `frame reference ${frameRef.label} is a historical daily pivot — historical pivots never frame`)
    }
  }

  const frameSide = frameRef ? judgedFrameSide(context, frameRef.id) : null
  const frameDirection = frameSide === 'above' ? 'long' : frameSide === 'below' ? 'short' : null

  const roleByBand = new Map(context.roles.map((r) => [r.bandId, r]))
  const bandById = new Map(context.bands.map((b) => [b.id, b]))
  const seen = new Set<string>()
  for (const play of judgment.plays) {
    const band = bandById.get(play.bandId)
    const role = roleByBand.get(play.bandId)
    if (!band || !role) {
      add('play_unknown_band', `play bandId "${play.bandId}" is not in the inventory`)
      continue
    }
    if (seen.has(play.bandId)) {
      add('play_duplicate_band', `band ${play.bandId} carries more than one play`)
    }
    seen.add(play.bandId)
    if (band.destinationOnly) {
      add('play_destination_only', `band ${play.bandId} is destination-only (ladder rungs never anchor a play)`)
    }
    if (role.side === 'above' && play.direction !== 'short') {
      add('play_direction_geometry', `band ${play.bandId} is above price — geometry says short, not ${play.direction}`)
    }
    if (role.side === 'below' && play.direction !== 'long') {
      add('play_direction_geometry', `band ${play.bandId} is below price — geometry says long, not ${play.direction}`)
    }
    if (role.side === 'inside') {
      if (frameDirection === null) {
        add('play_inside_without_frame_direction', `band ${play.bandId} contains price and the frame is 'at' its line — no directional read exists`)
      } else if (play.direction !== frameDirection) {
        add('play_direction_geometry', `band ${play.bandId} contains price — inside a band the play leans with the frame (${frameDirection}), not ${play.direction}`)
      }
    }
  }

  // Both sides, always (rule 2): every side gets a play or a one-line reason —
  // including a side holding only destination-only structure or nothing at all
  // ("nothing significant within reach below" is a valid answer; silence is
  // not). A stand-down declaration is a two-way answer for both.
  if (!judgment.standDown) {
    for (const side of ['above', 'below'] as const) {
      const hasPlay = judgment.plays.some((p) => roleByBand.get(p.bandId)?.side === side)
      const hasReason = judgment.sidesWithoutPlay.some((s) => s.side === side)
      if (!hasPlay && !hasReason) {
        add('side_unaddressed', `the ${side} side carries no play and no stated reason`)
      }
    }
  }

  if (judgment.standDown && (judgment.standDownText === null || judgment.standDownText.trim() === '')) {
    add('stand_down_without_text', 'standDown is declared without the two-way text naming the edges')
  }

  const invented = inventedPrices(judgment, context)
  if (invented.length > 0) {
    add('invented_price', `prose quotes price(s) the payload does not carry: ${invented.join(', ')} — name levels by their labels or by a supplied price`)
  }

  return violations
}
