import { JobPlanSchema, type JobPlan, type Play, type PrunedBranch } from '@/knowledge/schema/job-plan.schema'
import { geometryRefs, planMeta, type PlanMetaInput } from '../buildPlan'
import type { JobContext } from '../contextTypes'
import { frameFor } from '../planFrame'
import { buildBandPlay } from '../playGrammar'
import type { Candidate, PlayDraft } from '../planTypes'
import { MAX_PLAYS, PLANNER_REVISION } from '../rules'
import { LLM_PLANNER_REVISION } from './prompt'
import type { LlmPlanJudgment } from './schema'

/**
 * Assemble the persisted `JobPlan` from a VALIDATED LLM judgment (feat-145,
 * production cutover of the feat-144 experiment — the proposal's "safer
 * variant" of open question 1, upgraded: the model's structural choices
 * drive frame, play bands, direction, order, primary and lean, and its
 * forward-conditional TEXT becomes each play's summary; the geometry-heavy
 * parts (trigger, invalidation, destination chain, provenance, deadlines)
 * are composed by the SAME code grammar as the deterministic planner, so
 * every schema refinement — provenance tracing, destination ordering, R11 —
 * holds by construction.
 *
 * No stand-down play (feat-146, operator 2026-09-01): an LLM plan is a
 * catalog of forward scenarios at the areas that matter, never a
 * trade-this-instant decision — the deterministic planner's R10 two-way
 * declaration has no counterpart here.
 *
 * PRECONDITION: `validateJudgment` returned no violations (the runner throws
 * before assembly otherwise). Anything here that still fails is a broken
 * invariant, thrown as {@link LlmPlanAssemblyError} — retryable, like the
 * contract error.
 */

export class LlmPlanAssemblyError extends Error {
  constructor(message: string) {
    super(`llm-planner assembly: ${message}`)
    this.name = 'LlmPlanAssemblyError'
  }
}

/** The revision stamped on LLM plans: deterministic context revision + judgment prompt revision. */
export function llmPlannerRevision(): string {
  return `${PLANNER_REVISION}+${LLM_PLANNER_REVISION}`
}

export type AssembleLlmPlanInput = {
  readonly judgment: LlmPlanJudgment
  readonly context: JobContext
  /** Model id that served the judgment call (`result.model` from the runner). */
  readonly modelId: string
  /** The run's meta placeholders (bundle id, fingerprint, hashes, vision fields). */
  readonly meta?: PlanMetaInput
}

function candidateFor(context: JobContext, bandId: string): Candidate {
  const band = context.bands.find((b) => b.id === bandId)
  const role = context.roles.find((r) => r.bandId === bandId)
  const facts = context.origin.bands.find((f) => f.bandId === bandId)
  if (!band || !role || !facts) {
    throw new LlmPlanAssemblyError(`band ${bandId} passed validation but is missing from the context`)
  }
  return { band, role, facts, why: 'llm judgment' }
}

function toPlay(draft: PlayDraft, index: number): Play {
  const { precedence: _precedence, ...play } = draft
  void _precedence
  return { id: `play-${index + 1}`, rank: index + 1, primary: index === 0, ...play }
}

export function assembleLlmPlan(input: AssembleLlmPlanInput): JobPlan {
  const { judgment, context } = input
  const meta = input.meta ?? {}

  const frameRef = context.references.find((r) => r.id === judgment.frame.referenceId)
  if (!frameRef) {
    throw new LlmPlanAssemblyError(`frame reference ${judgment.frame.referenceId} passed validation but is missing`)
  }
  const frame = { ...frameFor(context, frameRef), llmRationale: judgment.frame.rationale }

  const ordered = judgment.plays.map((play): PlayDraft => {
    const result = buildBandPlay(candidateFor(context, play.bandId), context, frame)
    if (!('draft' in result)) {
      throw new LlmPlanAssemblyError(`band ${play.bandId} has no directional read: ${result.pruned}`)
    }
    if (result.draft.direction !== play.direction) {
      throw new LlmPlanAssemblyError(
        `band ${play.bandId}: judged ${play.direction} but geometry composes ${result.draft.direction}`,
      )
    }
    // The model's forward conditional is the visible one-liner; the code
    // grammar keeps owning trigger, invalidation, destinations, provenance.
    return { ...result.draft, summary: play.text, llmRationale: play.rationale }
  })
  const plays = ordered.slice(0, MAX_PLAYS).map(toPlay)

  const pruned: PrunedBranch[] = judgment.sidesWithoutPlay.map((s) => ({
    bandId: null,
    label: `${s.side} side`,
    reason: `LLM plan: no play on this side — ${s.reason}`,
  }))

  const standDownReasons = plays.length === 0 ? judgment.sidesWithoutPlay.map((s) => s.reason) : []

  const first = plays[0]
  const plan: JobPlan = {
    meta: planMeta(context, {
      ...meta,
      plannerRevision: llmPlannerRevision(),
      jobPlanner: 'llm',
      llmModelId: input.modelId,
      llmPromptRevision: LLM_PLANNER_REVISION,
    }),
    geometryRefs: geometryRefs(context),
    context,
    frame,
    lean: {
      playId: first?.id ?? null,
      basis: first === undefined ? 'none' : 'frame',
      text: judgment.lean,
    },
    plays,
    pruned,
    standDownReasons,
    warnings: [...context.warnings],
    status: 'ready',
  }
  JobPlanSchema.parse(plan)
  return plan
}
