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

export type JudgmentViolation = {
  readonly code: JudgmentViolationCode
  readonly message: string
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

  // Both sides, always: a side holding at least one playable band needs a play
  // or a stated reason. A stand-down declaration is a two-way answer for both.
  if (!judgment.standDown) {
    for (const side of ['above', 'below'] as const) {
      const playable = context.roles.some((r) => r.side === side && !r.destinationOnly)
      if (!playable) continue
      const hasPlay = judgment.plays.some((p) => roleByBand.get(p.bandId)?.side === side)
      const hasReason = judgment.sidesWithoutPlay.some((s) => s.side === side)
      if (!hasPlay && !hasReason) {
        add('side_unaddressed', `the ${side} side has playable structure but no play and no stated reason`)
      }
    }
  }

  if (judgment.standDown && (judgment.standDownText === null || judgment.standDownText.trim() === '')) {
    add('stand_down_without_text', 'standDown is declared without the two-way text naming the edges')
  }

  return violations
}
