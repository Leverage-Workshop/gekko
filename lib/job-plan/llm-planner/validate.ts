import type { JobContext } from '../contextTypes'
import { eligibleFrameCandidates, frameCandidates, type FrameCandidate } from '../frameCandidates'
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
  | 'play_direction_geometry'
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

  const frameSide = frame ? frame.side : null
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
  // not). Unconditional since feat-146 — there is no stand-down escape hatch.
  for (const side of ['above', 'below'] as const) {
    const hasPlay = judgment.plays.some((p) => roleByBand.get(p.bandId)?.side === side)
    const hasReason = judgment.sidesWithoutPlay.some((s) => s.side === side)
    if (!hasPlay && !hasReason) {
      add('side_unaddressed', `the ${side} side carries no play and no stated reason`)
    }
  }

  const invented = inventedPrices(judgment, context)
  if (invented.length > 0) {
    add('invented_price', `prose quotes price(s) the payload does not carry: ${invented.join(', ')} — name levels by their labels or by a supplied price`)
  }

  return violations
}
