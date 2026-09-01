import { z } from 'zod'
import { MAX_PLAYS } from '../rules'

/**
 * The LLM shadow planner's output contract (feat-144): the JUDGMENT only —
 * which line frames the day, which bands get plays, direction, order, lean.
 * Deliberately id-referenced: the model picks from the supplied inventory by
 * `bandId` / `referenceId` and never writes a price, so an invented level has
 * no field to live in. FLAT objects, no root unions (OpenAI-shaped, same
 * constraint as every other Gekko schema).
 *
 * This is NOT the persisted `JobPlan` schema — code owns assembly. The hard
 * gates the ratified proposal lists (tier-one frame, geometry-consistent
 * directions, both sides addressed, caps) live in `validate.ts`, enforced with
 * one retry by `runLlmPlanner.ts`.
 */

export const LlmFrameChoice = z.object({
  /** Id of a tier-one reference from the payload's `frameCandidates`. */
  referenceId: z.string().min(1),
  /** One sentence: why this line frames the day. */
  rationale: z.string().min(1),
})
export type LlmFrameChoice = z.infer<typeof LlmFrameChoice>

export const LlmPlayJudgment = z.object({
  /** Id of a confluence band from the payload's `bands`. */
  bandId: z.string().min(1),
  /** Geometry names it: long for an area below price, short for above. */
  direction: z.enum(['long', 'short']),
  /** The forward conditional, future tense: approach → expected turn → traverse → fork. */
  text: z.string().min(1),
  /** Why this area won its side (breach test included when a nearer level was passed over). */
  rationale: z.string().min(1),
})
export type LlmPlayJudgment = z.infer<typeof LlmPlayJudgment>

export const LlmSideNote = z.object({
  side: z.enum(['above', 'below']),
  /** The one-line reason this side carries no play. */
  reason: z.string().min(1),
})
export type LlmSideNote = z.infer<typeof LlmSideNote>

export const LlmPlanJudgmentSchema = z.object({
  frame: LlmFrameChoice,
  /**
   * Ordered by precedence: the first play is the primary look, sides
   * alternating from the frame side. No stand-down concept (feat-146,
   * operator 2026-09-01): a plan is a catalog of scenarios at the areas
   * that matter, never a trade-this-instant decision.
   */
  plays: z.array(LlmPlayJudgment).max(MAX_PLAYS),
  sidesWithoutPlay: z.array(LlmSideNote).max(2),
  /** One line naming the primary look and the side to lean with. */
  lean: z.string().min(1),
})
export type LlmPlanJudgment = z.infer<typeof LlmPlanJudgmentSchema>
