import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import type { JobContext } from '../contextTypes'
import { bandLabel } from '../playText'
import type { LlmPlanJudgment } from './schema'

/**
 * Shadow A/B comparison (feat-144): the deterministic plan vs the LLM
 * judgment on the SAME context, reduced to the choices the operator
 * adjudicates — frame, play band set, directions, primary, stand-down.
 * Agreements are baseline sanity; the disagreements ARE the experiment.
 */

export type PlayLine = {
  readonly bandId: string | null
  readonly label: string
  readonly direction: string
}

export type ShadowDiff = {
  readonly frame: {
    readonly deterministic: { readonly referenceId: string; readonly label: string } | null
    readonly llm: { readonly referenceId: string; readonly label: string }
    readonly agree: boolean
  }
  readonly plays: {
    readonly sharedBandIds: readonly string[]
    readonly onlyDeterministic: readonly PlayLine[]
    readonly onlyLlm: readonly PlayLine[]
    /** Shared bands where the two sides disagree on direction. */
    readonly directionMismatches: readonly { readonly bandId: string; readonly deterministic: string; readonly llm: string }[]
  }
  readonly primary: {
    readonly deterministic: string | null
    readonly llm: string | null
    readonly agree: boolean
  }
  readonly standDown: {
    readonly deterministic: boolean
    readonly llm: boolean
    readonly agree: boolean
  }
}

export type StabilityDiff = {
  readonly frameAgree: boolean
  readonly playSetAgree: boolean
  readonly primaryAgree: boolean
  readonly directionsAgree: boolean
  /** Every dimension above agrees. */
  readonly stable: boolean
}

function bandLabelById(context: JobContext, bandId: string | null): string {
  if (bandId === null) return '(zone)'
  const band = context.bands.find((b) => b.id === bandId)
  return band ? bandLabel(band) : bandId
}

/** Directional plays only — the stand-down declaration is compared separately. */
function deterministicPlays(plan: JobPlan): { bandId: string; direction: string }[] {
  return plan.plays
    .filter((p) => p.stance !== 'stand-down' && p.band.bandId !== null)
    .map((p) => ({ bandId: p.band.bandId as string, direction: p.direction }))
}

export function diffJudgment(plan: JobPlan, judgment: LlmPlanJudgment, context: JobContext): ShadowDiff {
  const det = deterministicPlays(plan)
  const detIds = new Set(det.map((p) => p.bandId))
  const llmIds = new Set(judgment.plays.map((p) => p.bandId))
  const shared = [...detIds].filter((id) => llmIds.has(id))

  const detDir = new Map(det.map((p) => [p.bandId, p.direction]))
  const llmDir = new Map(judgment.plays.map((p) => [p.bandId, p.direction as string]))

  const detPrimary = plan.plays.find((p) => p.primary && p.stance !== 'stand-down')?.band.bandId ?? null
  const llmPrimary = judgment.plays[0]?.bandId ?? null

  const detStandDown = plan.plays.some((p) => p.stance === 'stand-down')

  return {
    frame: {
      deterministic: plan.frame ? { referenceId: plan.frame.referenceId, label: plan.frame.label } : null,
      llm: {
        referenceId: judgment.frame.referenceId,
        label: context.references.find((r) => r.id === judgment.frame.referenceId)?.label ?? judgment.frame.referenceId,
      },
      agree: plan.frame?.referenceId === judgment.frame.referenceId,
    },
    plays: {
      sharedBandIds: shared,
      onlyDeterministic: det
        .filter((p) => !llmIds.has(p.bandId))
        .map((p) => ({ bandId: p.bandId, label: bandLabelById(context, p.bandId), direction: p.direction })),
      onlyLlm: judgment.plays
        .filter((p) => !detIds.has(p.bandId))
        .map((p) => ({ bandId: p.bandId, label: bandLabelById(context, p.bandId), direction: p.direction })),
      directionMismatches: shared
        .filter((id) => detDir.get(id) !== llmDir.get(id))
        .map((id) => ({ bandId: id, deterministic: detDir.get(id) as string, llm: llmDir.get(id) as string })),
    },
    primary: {
      deterministic: detPrimary,
      llm: llmPrimary,
      agree: detPrimary === llmPrimary,
    },
    standDown: {
      deterministic: detStandDown,
      llm: judgment.standDown,
      agree: detStandDown === judgment.standDown,
    },
  }
}

/** Two runs of the LLM planner on the same context: any flip is a stability failure. */
export function stabilityDiff(a: LlmPlanJudgment, b: LlmPlanJudgment): StabilityDiff {
  const aIds = a.plays.map((p) => p.bandId)
  const bIds = b.plays.map((p) => p.bandId)
  const frameAgree = a.frame.referenceId === b.frame.referenceId
  const playSetAgree = aIds.length === bIds.length && new Set(aIds).size === new Set([...aIds, ...bIds]).size
  const primaryAgree = (a.plays[0]?.bandId ?? null) === (b.plays[0]?.bandId ?? null) && a.standDown === b.standDown
  const bDir = new Map(b.plays.map((p) => [p.bandId, p.direction]))
  const directionsAgree = a.plays.every((p) => !bDir.has(p.bandId) || bDir.get(p.bandId) === p.direction)
  return {
    frameAgree,
    playSetAgree,
    primaryAgree,
    directionsAgree,
    stable: frameAgree && playSetAgree && primaryAgree && directionsAgree,
  }
}
