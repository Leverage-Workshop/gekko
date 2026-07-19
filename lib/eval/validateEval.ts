import type { EvalResult } from '@/knowledge/schema/briefing.schema'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
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
   * Engine-computed delta telemetry backing the sign gate: a window-mean sign
   * contradicting the ENTER direction demotes it to WAIT ONLY when the
   * extreme-bar counts also confirm counter-initiative — and never when the
   * contradiction is explained by an absorbed flush (see
   * {@link absorbedFlushException}). The mean sign alone never demotes.
   */
  deltaTelemetry: SignGateTelemetry
}

/** The telemetry facts the sign gate consumes. */
export type SignGateTelemetry = Pick<
  DeltaTelemetry,
  'sign' | 'recentRedExtremeCount' | 'recentBlueExtremeCount' | 'recentRange'
>

/**
 * How far off the flush extreme (as a fraction of the recent bar range) the
 * last close must have recovered for an absorbed flush to lift the sign gate:
 * ≥ 0.5 means price is back in the half of the recent range the entry points
 * toward — the flush failed.
 */
export const ABSORPTION_RECOVERY_POSITION = 0.5

/**
 * Sequence-aware exception to the sign gate (operator doctrine, 2026-07-18):
 * the window MEAN is guaranteed to contradict an absorption entry right when
 * it confirms — a red flush into a long border leaves the mean negative even
 * after the selling failed and price recovered. When the window contains
 * flush prints in the aggressor's color AND the last close has recovered to
 * the entry-side half of the recent range, the contradicting mean is
 * absorption evidence, not counter-initiative — do not demote.
 */
export function absorbedFlushException(
  direction: 'long' | 'short',
  telemetry: SignGateTelemetry,
): boolean {
  const { position } = telemetry.recentRange
  if (position === null) return false
  if (direction === 'long') {
    return (
      telemetry.recentRedExtremeCount > 0 && position >= ABSORPTION_RECOVERY_POSITION
    )
  }
  return (
    telemetry.recentBlueExtremeCount > 0 && position <= 1 - ABSORPTION_RECOVERY_POSITION
  )
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

  // Sign gate: a window-mean delta sign contradicting the ENTER direction
  // demotes it to WAIT (conservative) — but ONLY when the extreme-bar counts
  // also confirm counter-initiative. Initiative is a COUNT, not a mean (the
  // ripStatus doctrine): a window of mild -1/-2 bars carries a negative mean
  // without any real red aggression, so the mean sign alone must never demote.
  // A neutral sign passes; the model weighs it qualitatively. An absorbed flush
  // still lifts the gate: the mean AND the counts are expected to contradict an
  // absorption entry exactly when it confirms.
  if (result.status === 'ENTER') {
    const direction = result.direction ?? result.evaluatedLevel?.direction ?? null
    const telemetry = options.deltaTelemetry
    const signContradicts =
      (direction === 'long' && telemetry.sign === 'negative') ||
      (direction === 'short' && telemetry.sign === 'positive')
    // Do the extreme prints agree with the mean's contradiction? Only net
    // counter-side aggression (more red extremes than blue for a long, and the
    // mirror for a short) counts as real initiative against the entry.
    const countsConfirmCounter =
      direction === 'long'
        ? telemetry.recentRedExtremeCount > telemetry.recentBlueExtremeCount
        : direction === 'short'
          ? telemetry.recentBlueExtremeCount > telemetry.recentRedExtremeCount
          : false
    if (signContradicts && countsConfirmCounter && direction !== null) {
      const counterCount =
        direction === 'long'
          ? telemetry.recentRedExtremeCount
          : telemetry.recentBlueExtremeCount
      const entryCount =
        direction === 'long'
          ? telemetry.recentBlueExtremeCount
          : telemetry.recentRedExtremeCount
      if (absorbedFlushException(direction, telemetry)) {
        warnings.push(
          `engine delta sign is ${telemetry.sign} against the ${direction} ENTER with ${counterCount} counter-extreme ` +
            `vs ${entryCount} entry-extreme bars, but the flush was absorbed ` +
            `(last close at ${telemetry.recentRange.position} of the recent range) — ENTER kept`,
        )
      } else {
        warnings.push(
          `model returned ENTER ${direction} but the engine delta sign is ${telemetry.sign} and the counts confirm ` +
            `counter-initiative (${counterCount} counter-extreme vs ${entryCount} entry-extreme bars, ` +
            `last close at ${telemetry.recentRange.position} of the recent range) — coerced to WAIT`,
        )
        result = { ...result, status: 'WAIT' }
      }
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
