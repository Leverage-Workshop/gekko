import type { JobContext } from '../contextTypes'
import { eligibleFrameCandidates, frameCandidates, type FrameCandidate } from '../frameCandidates'
import { legalDirections, requiredSides, sideOfPlay } from '../frameRelation'
import { frameFor } from '../planFrame'
import type { LlmPlanJudgment } from './schema'

/**
 * The hard gates the ratified proposal keeps code-side (feat-144,
 * docs/job-plan-llm-planner-proposal.md "Judgment granted vs. invariants
 * kept"). Everything here is mechanical — a violation is a contract break,
 * not a judgment disagreement — and `runLlmPlanner` retries ONCE with the
 * violations spelled out before recording them.
 *
 * What is deliberately NOT checked: which band the model picked within a side,
 * ranking order, reach (guidance, not a wall). Those are the judgment. The
 * stand-down concept was removed entirely 2026-09-01 (feat-146): both sides
 * need a play or a stated reason UNCONDITIONALLY.
 */

export type JudgmentViolationCode =
  | 'frame_unknown_candidate'
  | 'frame_out_of_reach'
  | 'play_unknown_band'
  | 'play_duplicate_band'
  | 'play_destination_only'
  | 'play_direction_frame'
  | 'play_inside_without_frame_direction'
  | 'side_unaddressed'
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
 * price. Price magnitude = at least half the current price, which catches
 * inventions on either side of the inventory span ("toward 21000" above a
 * 20500 top, "toward 4800" under a 5000 ES floor) while leaving legitimate
 * non-price numerics (point distances, minutes, sigma multiples) — which live
 * orders of magnitude below an NQ/ES price — out of scope.
 */
export function inventedPrices(judgment: LlmPlanJudgment, context: JobContext): number[] {
  const known = knownPrices(context)
  const floor = context.price.value / 2
  if (!Number.isFinite(floor) || floor <= 0) return []
  const prose = [
    judgment.frame.rationale,
    judgment.lean,
    ...judgment.plays.flatMap((p) => [p.text, p.rationale]),
    ...judgment.sidesWithoutPlay.map((s) => s.reason),
  ].join('\n')
  const invented = new Set<number>()
  for (const match of prose.matchAll(NUMBER_RE)) {
    const value = Number(match[0].replace(/,/g, ''))
    if (!Number.isFinite(value) || value < floor) continue
    if (!known.some((k) => Math.abs(k - value) < PRICE_EPSILON)) invented.add(value)
  }
  return [...invented]
}

/** The frame candidate the judgment named, or null when the id is not a candidate. */
export function judgedFrameCandidate(context: JobContext, bandId: string): FrameCandidate | null {
  return frameCandidates(context).find((c) => c.bandId === bandId) ?? null
}

export function validateJudgment(judgment: LlmPlanJudgment, context: JobContext): JudgmentViolation[] {
  const violations: JudgmentViolation[] = []
  const add = (code: JudgmentViolationCode, message: string) => violations.push({ code, message })

  // feat-148: the frame is one of the supplied candidate bands, and — unless
  // nothing at all is in reach — one within reach (the daily pivot always).
  const candidates = frameCandidates(context)
  const frame = candidates.find((c) => c.bandId === judgment.frame.bandId) ?? null
  if (!frame) {
    add('frame_unknown_candidate', `frame.bandId "${judgment.frame.bandId}" is not one of the frameCandidates`)
  } else if (!eligibleFrameCandidates(candidates).some((c) => c.bandId === frame.bandId)) {
    add('frame_out_of_reach', `frame candidate ${frame.anchorLabel} is ${frame.distancePts} pts away — beyond reach while other candidates are within it; a bias line a session away is no filter`)
  }

  // feat-149: plays are read against the frame. The PlanFrame the judged
  // candidate would compose is what the grammar reads from.
  const planFrame = frame ? frameFor(context, frame) : null

  const roleByBand = new Map(context.roles.map((r) => [r.bandId, r]))
  const bandById = new Map(context.bands.map((b) => [b.id, b]))
  const seen = new Set<string>()
  const addressed = new Set<string>()
  for (const play of judgment.plays) {
    const band = bandById.get(play.bandId)
    const role = roleByBand.get(play.bandId)
    if (!band || !role) {
      add('play_unknown_band', `play bandId "${play.bandId}" is not in the inventory`)
      continue
    }
    // One play per band, except the frame band, which carries one per direction.
    const key = `${play.bandId}:${play.direction}`
    const legal = legalDirections(band, role.side, planFrame)
    if (seen.has(key) || ([...seen].some((k) => k.startsWith(`${play.bandId}:`)) && legal.length < 2)) {
      add('play_duplicate_band', `band ${play.bandId} carries more than one play${legal.length < 2 ? ' (only the line and an unreached level beyond price may carry both directions)' : ' in the same direction'}`)
    }
    seen.add(key)
    if (band.destinationOnly) {
      add('play_destination_only', `band ${play.bandId} is destination-only (ladder rungs never anchor a play)`)
    }
    if (legal.length === 0) {
      add('play_inside_without_frame_direction', `band ${play.bandId} contains price and the frame is 'at' its line — no directional read exists`)
    } else if (!legal.includes(play.direction)) {
      add('play_direction_frame', `band ${play.bandId}: the frame reads ${legal.join(' or ')} here, not ${play.direction} — between the line and price only the bias direction; at the line and at an unreached level beyond price both (the counter-bias one as a fail); beyond the line only the fork direction`)
    }
    const addressedSide = sideOfPlay(band, role.side, play.direction, planFrame)
    if (addressedSide) addressed.add(addressedSide)
  }

  // Both sides of the FRAME, always (rule 2, feat-149): the bias side and the
  // fork side each get a play or a one-line reason (the two sides of price
  // when the frame is at its band). Silence is never an answer.
  for (const side of requiredSides(planFrame)) {
    const hasReason = judgment.sidesWithoutPlay.some((s) => s.side === side)
    if (!addressed.has(side) && !hasReason) {
      add('side_unaddressed', `the ${side} side carries no play and no stated reason`)
    }
  }

  const invented = inventedPrices(judgment, context)
  if (invented.length > 0) {
    add('invented_price', `prose quotes price(s) the payload does not carry: ${invented.join(', ')} — name levels by their labels or by a supplied price`)
  }

  return violations
}
