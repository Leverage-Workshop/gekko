import type { Briefing, BriefingMeta, Objective } from '@/knowledge/schema/briefing.schema'
import { DEFAULT_RR_MIN, objectiveRiskReward } from '@/lib/engine/riskReward'
import type { RiskReward } from '@/lib/engine/riskReward'

/**
 * Post-LLM enforcement of the code-owned facts (mirroring the eval-task's
 * enforceEvalFacts): terrain borders must be the engine's (No-Gap invariant),
 * `Objective.rr` is always recomputed by riskReward.ts, and the code-owned
 * `meta` fields (createdAt, currentPrice, triggerReason, ripStatus when the
 * engine computed one) are overwritten — the model's values are advisory
 * input, never persisted.
 */

/** Thrown when the model output violates a hard invariant — retryable. */
export class BriefingValidationError extends Error {}

const PRICE_EPSILON = 1e-6

export interface ValidatedBriefing {
  /** The briefing with engine-recomputed `rr` on both objectives. */
  briefing: Briefing
  /** Engine R/R verdicts (protective stop, gate, reasons) per objective. */
  riskReward: { primary: RiskReward; secondary: RiskReward }
  /** Advisory findings (gate misses, off-engine borders, widened stops). */
  warnings: string[]
}

/** Code-owned `meta` values, supplied by the orchestrator (runAnalysis). */
export interface CodeOwnedMeta {
  /** ISO timestamp of this run (code-owned `meta.createdAt`). */
  createdAt: string
  /** `engineFacts.currentPrice` (code-owned `meta.currentPrice`). */
  currentPrice: number
  /** The task's trigger reason (code-owned `meta.triggerReason`). */
  triggerReason: string
  /**
   * The engine's Rip condition, or null when `mgi.daily.rip` was absent and
   * the engine could not compute one — in that case the model's value is kept.
   */
  ripStatus: string | null
}

export interface ValidateOptions {
  /** R/R gate from `config.rr_min`; defaults to {@link DEFAULT_RR_MIN}. */
  rrMin?: number
  /** Engine zone border prices; model zone borders must be drawn from these. */
  engineBorders?: readonly number[]
  /** Code-owned `meta` values; when present the model's are overwritten. */
  meta?: CodeOwnedMeta
}

function samePrice(a: number, b: number): boolean {
  return Math.abs(a - b) < PRICE_EPSILON
}

/**
 * Enforce the No-Gap invariant on the model's zone stack: every zone spans
 * top > bottom and `zones[N].bottom === zones[N+1].top` (price-descending).
 *
 * @throws {BriefingValidationError} on any gap, overlap or inverted zone.
 */
export function assertZoneContiguity(briefing: Briefing): void {
  const zones = briefing.terrain.zones
  if (zones.length === 0) {
    throw new BriefingValidationError('terrain.zones is empty')
  }
  for (const zone of zones) {
    if (!(zone.top > zone.bottom)) {
      throw new BriefingValidationError(
        `zone "${zone.label}" is inverted: top ${zone.top} <= bottom ${zone.bottom}`,
      )
    }
  }
  for (let i = 0; i < zones.length - 1; i += 1) {
    if (!samePrice(zones[i].bottom, zones[i + 1].top)) {
      throw new BriefingValidationError(
        `No-Gap invariant violated between "${zones[i].label}" (bottom ${zones[i].bottom}) and "${zones[i + 1].label}" (top ${zones[i + 1].top})`,
      )
    }
  }
}

function offEngineBorders(
  briefing: Briefing,
  engineBorders: readonly number[],
): number[] {
  const modelBorders = briefing.terrain.zones.flatMap((z) => [z.top, z.bottom])
  return [...new Set(modelBorders)].filter(
    (price) => !engineBorders.some((border) => samePrice(border, price)),
  )
}

/** Overwrite the code-owned `meta` fields, warning on any model drift. */
function enforceMeta(
  meta: BriefingMeta,
  code: CodeOwnedMeta,
  warnings: string[],
): BriefingMeta {
  if (meta.createdAt !== code.createdAt) {
    warnings.push(
      `model claimed meta.createdAt=${meta.createdAt}; code says ${code.createdAt} — overwritten`,
    )
  }
  if (!samePrice(meta.currentPrice, code.currentPrice)) {
    warnings.push(
      `model claimed meta.currentPrice=${meta.currentPrice}; engine says ${code.currentPrice} — overwritten`,
    )
  }
  if (meta.triggerReason !== code.triggerReason) {
    warnings.push(
      `model claimed meta.triggerReason=${meta.triggerReason}; task says ${code.triggerReason} — overwritten`,
    )
  }
  // ripStatus is only code-owned when the engine actually computed a Rip
  // condition (mgi.daily.rip present); otherwise the model's read stands.
  if (code.ripStatus !== null && meta.ripStatus !== code.ripStatus) {
    warnings.push(
      `model claimed meta.ripStatus=${meta.ripStatus}; engine says ${code.ripStatus} — overwritten`,
    )
  }
  return {
    ...meta,
    createdAt: code.createdAt,
    currentPrice: code.currentPrice,
    triggerReason: code.triggerReason,
    ripStatus: code.ripStatus ?? meta.ripStatus,
  }
}

function recomputeObjective(
  name: 'primary' | 'secondary',
  objective: Objective,
  rrMin: number,
  warnings: string[],
): { objective: Objective; riskReward: RiskReward } {
  let verdict: RiskReward
  try {
    verdict = objectiveRiskReward(objective, { rrMin })
  } catch (error) {
    throw new BriefingValidationError(
      `${name} objective has invalid R/R geometry: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!verdict.valid) {
    warnings.push(`${name} objective fails the R/R gate: ${verdict.reasons.join('; ')}`)
  }
  return { objective: { ...objective, rr: verdict.rr }, riskReward: verdict }
}

/**
 * Validate a model briefing against the engine and overwrite the code-owned
 * fields. Hard invariant violations throw (the task retries with a fresh
 * generation); advisory findings are returned as warnings.
 */
export function enforceCodeOwnedFacts(
  briefing: Briefing,
  options: ValidateOptions = {},
): ValidatedBriefing {
  const rrMin = options.rrMin ?? DEFAULT_RR_MIN
  const warnings: string[] = []

  assertZoneContiguity(briefing)

  if (options.engineBorders && options.engineBorders.length > 0) {
    const strays = offEngineBorders(briefing, options.engineBorders)
    if (strays.length > 0) {
      warnings.push(
        `model zone borders not in the engine border set: ${strays.join(', ')}`,
      )
    }
  }

  const primary = recomputeObjective('primary', briefing.primary, rrMin, warnings)
  const secondary = recomputeObjective('secondary', briefing.secondary, rrMin, warnings)

  return {
    briefing: {
      ...briefing,
      meta: options.meta ? enforceMeta(briefing.meta, options.meta, warnings) : briefing.meta,
      primary: primary.objective,
      secondary: secondary.objective,
    },
    riskReward: { primary: primary.riskReward, secondary: secondary.riskReward },
    warnings,
  }
}
