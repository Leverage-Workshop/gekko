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
  /** `bandId` of a candidate from the payload's `frameCandidates` (feat-148: the frame is a band). */
  bandId: z.string().min(1),
  /** One sentence: why this band is the bias line. */
  rationale: z.string().min(1),
})
export type LlmFrameChoice = z.infer<typeof LlmFrameChoice>

export const LlmPlayJudgment = z.object({
  /** Id of a confluence band from the payload's `bands` — never the frame band (feat-151); an unreached important level beyond price may appear twice, once per direction. */
  bandId: z.string().min(1),
  /** The frame names it (feat-149): the bias direction on the bias side and beyond price (plus the fail at an important level), the fork direction on the far side. */
  direction: z.enum(['long', 'short']),
  /** The forward conditional, future tense: approach → expected turn → traverse → fork. */
  text: z.string().min(1),
  /** Why this area won its side (breach test included when a nearer level was passed over). */
  rationale: z.string().min(1),
})
export type LlmPlayJudgment = z.infer<typeof LlmPlayJudgment>

export const LlmSideNote = z.object({
  /** feat-149: 'bias' | 'fork' when the frame has a direction; 'above' | 'below' (of price) when the frame is at its band. */
  side: z.enum(['bias', 'fork', 'above', 'below']),
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
