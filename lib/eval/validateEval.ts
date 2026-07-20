import type { EvalResult } from '@/knowledge/schema/briefing.schema'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { RED_BUILDING_MIN_BARS } from '@/lib/engine/ripStatus'
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
   * Engine-computed delta telemetry backing the initiative gate: an ENTER is
   * demoted to WAIT when the extreme-bar counts confirm counter-initiative
   * (net counter-side extremes, at least {@link RED_BUILDING_MIN_BARS} of
   * them) — and never when the contradiction is explained by an absorbed
   * flush (see {@link absorbedFlushException}). The window MEAN plays no part
   * (initiative is a COUNT, not a mean — the ripStatus doctrine).
   */
  deltaTelemetry: SignGateTelemetry
}

/** The telemetry facts the initiative gate consumes. */
export type SignGateTelemetry = Pick<
  DeltaTelemetry,
  'recentRedExtremeCount' | 'recentBlueExtremeCount' | 'recentRange'
>

/**
 * How far beyond the window's prior close edge the latest bar must CLOSE to
 * count as price exiting the area (operator doctrine, 2026-07-20: a bar
 * poking a couple of ticks past a flush extreme is a probe, not
 * continuation). Two NQ ticks.
 */
export const AREA_EXIT_TOLERANCE_PTS = 0.5

/**
 * Sequence-aware exception to the initiative gate (operator doctrine,
 * 2026-07-18, reworked 2026-07-20): counter-extreme prints are guaranteed to
 * contradict an absorption entry right when it confirms — a red flush into a
 * long border IS the volume the passive buyer eats, and the chop that follows
 * is what builds the delta stack. Absorption fails only when price EXITS the
 * area: the latest bar closing beyond the earlier window's accepted closes in
 * the flush direction (below the prior lowest close for a long, above the
 * prior highest close for a short). While the last close holds inside or
 * beyond-entry-side of that area, the contradicting counts are absorption
 * evidence, not counter-initiative — do not demote. Closes define the area;
 * wicks and tick-sweeps past the extreme never count as an exit.
 */
export function absorbedFlushException(
  direction: 'long' | 'short',
  telemetry: SignGateTelemetry,
): boolean {
  const { lastClose, priorMinClose, priorMaxClose } = telemetry.recentRange
  if (direction === 'long') {
    if (telemetry.recentRedExtremeCount === 0 || priorMinClose === null) return false
    return lastClose >= priorMinClose - AREA_EXIT_TOLERANCE_PTS
  }
  if (telemetry.recentBlueExtremeCount === 0 || priorMaxClose === null) return false
  return lastClose <= priorMaxClose + AREA_EXIT_TOLERANCE_PTS
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

  // Initiative gate: extreme-bar counts confirming counter-initiative demote
  // an ENTER to WAIT (conservative). Initiative is a COUNT, not a mean (the
  // ripStatus doctrine), so the window mean plays no part: a negative mean
  // over mild -1/-2 drift must never demote a long, and a mean dragged back
  // to neutral by mild entry-side bars must never veto a genuine cluster of
  // counter-extremes. Counter-initiative confirms only when the counter side
  // out-prints the entry side AND clusters at least RED_BUILDING_MIN_BARS
  // deep (one rogue 750-volume print carries no weight). An absorbed flush
  // still lifts the gate: the counts are expected to contradict an absorption
  // entry exactly when it confirms.
  if (result.status === 'ENTER') {
    const direction = result.direction ?? result.evaluatedLevel?.direction ?? null
    const telemetry = options.deltaTelemetry
    if (direction !== null) {
      const counterCount =
        direction === 'long'
          ? telemetry.recentRedExtremeCount
          : telemetry.recentBlueExtremeCount
      const entryCount =
        direction === 'long'
          ? telemetry.recentBlueExtremeCount
          : telemetry.recentRedExtremeCount
      const countsConfirmCounter =
        counterCount > entryCount && counterCount >= RED_BUILDING_MIN_BARS
      if (countsConfirmCounter) {
        const areaEdge =
          direction === 'long'
            ? telemetry.recentRange.priorMinClose
            : telemetry.recentRange.priorMaxClose
        const edgeName = direction === 'long' ? 'close floor' : 'close ceiling'
        if (absorbedFlushException(direction, telemetry)) {
          warnings.push(
            `extreme counts run against the ${direction} ENTER (${counterCount} counter-extreme ` +
              `vs ${entryCount} entry-extreme bars), but the flush is being absorbed — price has ` +
              `not closed out of the area (last close ${telemetry.recentRange.lastClose} vs ` +
              `prior ${edgeName} ${areaEdge}) — ENTER kept`,
          )
        } else {
          warnings.push(
            `model returned ENTER ${direction} but the extreme counts confirm counter-initiative ` +
              `(${counterCount} counter-extreme vs ${entryCount} entry-extreme bars) and price has ` +
              `closed out of the area (last close ${telemetry.recentRange.lastClose} vs ` +
              `prior ${edgeName} ${areaEdge}) — coerced to WAIT`,
          )
          result = { ...result, status: 'WAIT' }
        }
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
