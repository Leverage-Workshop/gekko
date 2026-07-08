import type { EvalResult } from '@/knowledge/schema/briefing.schema'
import type { EntryLevelRow, ProximityAssessment } from './proximity'

/**
 * Post-model enforcement for the eval-task, mirroring the analyze-task's
 * enforceCodeOwnedFacts: code owns the timestamp, the current price and the
 * near/not-near gate; the model owns only the ENTER/WAIT/NOT_VALID judgment
 * and the narrative. Any model drift on code-owned facts is overwritten (with
 * a warning), never persisted.
 */

/** One NQ tick — price matches within this are "the same level". */
const PRICE_EPSILON = 0.25

export interface EnforceEvalOptions {
  /** ISO timestamp of this run (code-owned `meta.createdAt`). */
  now: string
  /** `raw_bundles.current_price` (code-owned `meta.currentPrice`). */
  currentPrice: number
  proximity: ProximityAssessment
  /** The active levels shown to the model, for evaluatedLevel → id mapping. */
  levels: readonly EntryLevelRow[]
}

export interface ValidatedEval {
  result: EvalResult
  /** The `entry_levels.id` the verdict is about, or null (NO_ENTRY_NEAR). */
  evaluatedLevelId: string | null
  warnings: string[]
}

/** Match the model's echoed evaluatedLevel back to an active row's id. */
function resolveEvaluatedLevelId(
  result: EvalResult,
  options: EnforceEvalOptions,
  warnings: string[],
): string | null {
  const echoed = result.evaluatedLevel
  if (echoed) {
    const match = options.levels.find(
      (level) =>
        typeof level.price === 'number' &&
        Math.abs(level.price - echoed.price) <= PRICE_EPSILON &&
        (level.direction === null || level.direction === echoed.direction),
    )
    if (match) {
      return match.id
    }
    warnings.push(
      `model evaluatedLevel (${echoed.label} @ ${echoed.price} ${echoed.direction}) matches no active entry level — falling back to the code-nearest level`,
    )
  }
  return options.proximity.nearest?.level.id ?? null
}

/**
 * Overwrite code-owned facts in a model EvalResult and resolve the
 * `evaluated_level_id` foreign key. When the code-computed gate says price is
 * NOT near any active entry, the status is forced to NO_ENTRY_NEAR (dropping
 * any level verdict the model hallucinated) — advisory conservatism.
 */
export function enforceEvalFacts(
  model: EvalResult,
  options: EnforceEvalOptions,
): ValidatedEval {
  const warnings: string[] = []
  const { proximity } = options

  if (model.meta.nearEntry !== proximity.nearEntry) {
    warnings.push(
      `model claimed meta.nearEntry=${model.meta.nearEntry}; code-computed gate says ${proximity.nearEntry} — overwritten`,
    )
  }

  let result: EvalResult = {
    ...model,
    meta: {
      ...model.meta,
      createdAt: options.now,
      currentPrice: options.currentPrice,
      nearEntry: proximity.nearEntry,
    },
  }

  if (!proximity.nearEntry && result.status !== 'NO_ENTRY_NEAR') {
    warnings.push(
      `model returned status=${result.status} but no active entry is near — coerced to NO_ENTRY_NEAR`,
    )
    result = {
      meta: result.meta,
      status: 'NO_ENTRY_NEAR',
      reason: result.reason,
    }
  }

  if (proximity.nearEntry && result.status === 'NO_ENTRY_NEAR') {
    warnings.push(
      'code-computed gate says an active entry IS near, but the model returned NO_ENTRY_NEAR — kept (conservative), review the reason',
    )
  }

  if (result.status !== 'NO_ENTRY_NEAR' && !result.evaluatedLevel) {
    const nearest = proximity.nearest
    if (nearest?.level.price != null && nearest.level.direction != null) {
      warnings.push(
        'model omitted evaluatedLevel for a level verdict — filled from the code-nearest active level',
      )
      result = {
        ...result,
        evaluatedLevel: {
          label: nearest.level.label ?? 'Entry',
          price: nearest.level.price,
          direction: nearest.level.direction,
        },
      }
    }
  }

  const evaluatedLevelId =
    result.status === 'NO_ENTRY_NEAR'
      ? null
      : resolveEvaluatedLevelId(result, options, warnings)

  return { result, evaluatedLevelId, warnings }
}
