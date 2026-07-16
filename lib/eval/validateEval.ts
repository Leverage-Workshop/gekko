import type { EvalResult } from '@/knowledge/schema/briefing.schema'
import type { DeltaSign } from '@/lib/engine/deltaTelemetry'
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
  /**
   * Engine-computed `deltaTelemetry.sign`. Gem doctrine requires Delta > 0
   * for a long ENTER and Delta < 0 for a short ENTER; a contradicting sign
   * demotes ENTER to WAIT (code-owned gate).
   */
  deltaSign: DeltaSign
}

export interface ValidatedEval {
  result: EvalResult
  /** The `entry_levels.id` the verdict is about, or null (NO_ENTRY_NEAR). */
  evaluatedLevelId: string | null
  warnings: string[]
}

/**
 * Match the model's echoed evaluatedLevel back to an active row's id. Prefers
 * an exact label match (label + direction + price within one tick) — primary
 * and secondary objectives can share a border price, so price+direction alone
 * is ambiguous — then falls back to price+direction. When the echo matches
 * nothing within tolerance the FK stays null (with a warning): pointing it at
 * the code-nearest row would link a row the persisted direction/trigger/stop/
 * targets columns don't describe.
 */
function resolveEvaluatedLevelId(
  result: EvalResult,
  options: EnforceEvalOptions,
  warnings: string[],
): string | null {
  const echoed = result.evaluatedLevel
  if (!echoed) {
    return options.proximity.nearest?.level.id ?? null
  }
  const priceAndDirectionMatch = (level: EnforceEvalOptions['levels'][number]) =>
    typeof level.price === 'number' &&
    Math.abs(level.price - echoed.price) <= PRICE_EPSILON &&
    (level.direction === null || level.direction === echoed.direction)
  const exact = options.levels.find(
    (level) => level.label === echoed.label && priceAndDirectionMatch(level),
  )
  if (exact) {
    return exact.id
  }
  const byPrice = options.levels.find(priceAndDirectionMatch)
  if (byPrice) {
    return byPrice.id
  }
  warnings.push(
    `model evaluatedLevel (${echoed.label} @ ${echoed.price} ${echoed.direction}) matches no active entry level — persisting with evaluated_level_id=null`,
  )
  return null
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
      evaluatedLevel: null,
      direction: null,
      trigger: null,
      stop: null,
      targets: null,
      checks: null,
      nextSignal: null,
      caution: null,
      reason: result.reason,
    }
  }

  if (proximity.nearEntry && result.status === 'NO_ENTRY_NEAR') {
    warnings.push(
      'code-computed gate says an active entry IS near, but the model returned NO_ENTRY_NEAR — kept (conservative), review the reason',
    )
  }

  // Gem doctrine: "explicitly verify that CSV Delta > 0 for longs, or
  // Delta < 0 for shorts before suggesting ENTER". A contradicting engine
  // sign demotes ENTER to WAIT (conservative); a neutral sign passes — the
  // model weighs it qualitatively.
  if (result.status === 'ENTER') {
    const direction = result.direction ?? result.evaluatedLevel?.direction ?? null
    const contradicts =
      (direction === 'long' && options.deltaSign === 'negative') ||
      (direction === 'short' && options.deltaSign === 'positive')
    if (contradicts) {
      warnings.push(
        `model returned ENTER ${direction} but the engine delta sign is ${options.deltaSign} — coerced to WAIT (doctrine: Delta > 0 for longs, Delta < 0 for shorts)`,
      )
      result = { ...result, status: 'WAIT' }
    }
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
