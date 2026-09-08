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
    readonly deterministic: { readonly bandId: string | null; readonly label: string } | null
    readonly llm: { readonly bandId: string; readonly label: string }
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
  /** Whether the deterministic plan declared the R10 two-way (the LLM has no stand-down concept since feat-146). */
  readonly deterministicStandDown: boolean
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

  // A band's reads as a SET: a two-way play (feat-152) counts as both directions, so a judged
  // long or short at a band the deterministic plan reads two-way is agreement.
  const dirs = (list: readonly { bandId: string; direction: string }[]) => {
    const m = new Map<string, string>()
    for (const p of list) {
      const own = p.direction === 'two-way' ? ['long', 'short'] : [p.direction]
      m.set(p.bandId, [...new Set([...(m.get(p.bandId)?.split('+') ?? []), ...own])].sort().join('+'))
    }
    return m
  }
  const detDir = dirs(det)
  const llmDir = dirs(judgment.plays)

  const detPrimary = plan.plays.find((p) => p.primary && p.stance !== 'stand-down')?.band.bandId ?? null
  const llmPrimary = judgment.plays[0]?.bandId ?? null

  return {
    frame: {
      deterministic: plan.frame ? { bandId: plan.frame.bandId ?? null, label: plan.frame.label } : null,
      llm: {
        bandId: judgment.frame.bandId,
        label: bandLabelById(context, judgment.frame.bandId),
      },
      agree: (plan.frame?.bandId ?? null) === judgment.frame.bandId,
    },
    plays: {
      sharedBandIds: shared,
      onlyDeterministic: det
        .filter((p) => !llmIds.has(p.bandId))
        .map((p) => ({ bandId: p.bandId, label: bandLabelById(context, p.bandId), direction: p.direction })),
      onlyLlm: judgment.plays
        .filter((p) => !detIds.has(p.bandId))
        .map((p) => ({ bandId: p.bandId, label: bandLabelById(context, p.bandId), direction: p.direction })),
      // A mismatch is a judged direction the deterministic plan does NOT carry at
      // that band (a two-way carries both — picking one of them is agreement).
      directionMismatches: shared
        .filter((id) => !(llmDir.get(id) as string).split('+').every((d) => (detDir.get(id) as string).split('+').includes(d)))
        .map((id) => ({ bandId: id, deterministic: detDir.get(id) as string, llm: llmDir.get(id) as string })),
    },
    primary: {
      deterministic: detPrimary,
      llm: llmPrimary,
      agree: detPrimary === llmPrimary,
    },
    deterministicStandDown: plan.plays.some((p) => p.stance === 'stand-down'),
  }
}

/** Every run vs the first: any flip in ANY later run is a stability failure. */
export function stabilityAcross(judgments: readonly LlmPlanJudgment[]): StabilityDiff | null {
  if (judgments.length < 2) return null
  const diffs = judgments.slice(1).map((j) => stabilityDiff(judgments[0], j))
  return {
    frameAgree: diffs.every((d) => d.frameAgree),
    playSetAgree: diffs.every((d) => d.playSetAgree),
    primaryAgree: diffs.every((d) => d.primaryAgree),
    directionsAgree: diffs.every((d) => d.directionsAgree),
    stable: diffs.every((d) => d.stable),
  }
}

/** Two runs of the LLM planner on the same context: any flip is a stability failure. */
export function stabilityDiff(a: LlmPlanJudgment, b: LlmPlanJudgment): StabilityDiff {
  const key = (p: { bandId: string; direction: string }) => `${p.bandId}:${p.direction}`
  const aIds = a.plays.map(key)
  const bIds = b.plays.map(key)
  const frameAgree = a.frame.bandId === b.frame.bandId
  const playSetAgree = aIds.length === bIds.length && new Set(aIds).size === new Set([...aIds, ...bIds]).size
  const primaryAgree = (a.plays[0] ? key(a.plays[0]) : null) === (b.plays[0] ? key(b.plays[0]) : null)
  const bBands = new Set(b.plays.map((p) => p.bandId))
  const bKeys = new Set(bIds)
  const directionsAgree = a.plays.every((p) => !bBands.has(p.bandId) || bKeys.has(key(p)))
  return {
    frameAgree,
    playSetAgree,
    primaryAgree,
    directionsAgree,
    stable: frameAgree && playSetAgree && primaryAgree && directionsAgree,
  }
}
