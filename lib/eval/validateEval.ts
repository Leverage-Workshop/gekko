import { EvalResult } from '@/knowledge/schema/briefing.schema'
import type { Direction } from '@/knowledge/schema/briefing.schema'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { ExecBar } from '@/lib/engine/parseExecBars'
import { RED_BUILDING_MIN_BARS } from '@/lib/engine/ripStatus'
import type {
  ConfirmedAbsorptionCandidate,
  ConfirmedAbsorptionScanResult,
} from '@/lib/engine/stallConfirmation'
import type { EntryLevelRow, ProximityAssessment } from './proximity'

/**
 * Thrown when the model's verdict contradicts a code-owned fact in a way no
 * coercion can honestly repair (feat-083) — e.g. NO_ENTRY_NEAR while the
 * code-owned gate says a level IS near: a coherent level verdict needs checks
 * and a judgment only the model can make, so the run must retry, not persist
 * the contradiction. Deliberately NOT an EvalInputError — retrying CAN help.
 */
export class EvalContractViolationError extends Error {}

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
  /**
   * The recent exec-bar window backing the extreme counts (feat-085) — the
   * absorbed-flush exception requires the flush to have CONTACTED the
   * evaluated level, judged bar by bar.
   */
  recentBars: readonly ExecBar[]
  /**
   * Code-owned absorption scan (feat-085): a stall-confirmed stack in the
   * flush color at the evaluated level is the strongest absorption evidence
   * the exception consumes. Null when the bundle carried no delta exports.
   */
  absorption: ConfirmedAbsorptionScanResult | null
  /**
   * Position-eval mode (the Long / Short buttons): the operator declared this
   * direction and the evaluated level IS the current price — both are
   * code-owned, and no `entry_levels` row is linked. Null/absent for the
   * standard entry check.
   */
  position?: Direction | null
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
 * How close a recent bar must come to the evaluated level for the flush to
 * count as contact WITH that border (feat-085). Sized off the measured
 * 750-volume exec bars (chart-data rolling sample: median high-low span
 * ~14.75 pts, mean ~17.7): a flush that reverses one bar early naturally
 * stalls about half a bar short of the border, so tolerance covers that
 * front-run while staying well inside the 20-pt proximity gate and the
 * 25-pt rotation scale — counter-extremes printed a rotation away are just
 * counter-initiative, not absorption at this level.
 */
export const LEVEL_CONTACT_TOLERANCE_PTS = 10

/** The level-and-sequence facts the absorbed-flush exception judges (feat-085). */
export interface AbsorbedFlushContext {
  /** Price of the evaluated level; null degrades to no exception (conservative). */
  levelPrice: number | null
  /** The recent exec-bar window backing the extreme counts. */
  recentBars: readonly ExecBar[]
  /** Code-owned absorption scan (stall-annotated), when the bundle carried delta exports. */
  absorption: ConfirmedAbsorptionScanResult | null
}

/** Distance from a price to a bar's [low, high] span; 0 when inside it. */
function distanceToBar(price: number, bar: ExecBar): number {
  if (price < bar.low) return bar.low - price
  if (price > bar.high) return price - bar.high
  return 0
}

/** Distance from a price to a stack's [bottom, top] band; 0 when inside it. */
function distanceToStack(price: number, stack: ConfirmedAbsorptionCandidate): number {
  if (price < stack.bottom) return stack.bottom - price
  if (price > stack.top) return price - stack.top
  return 0
}

/**
 * Sequence-aware exception to the initiative gate (operator doctrine,
 * 2026-07-18, reworked 2026-07-20; made level-aware 2026-08-02, adversarial
 * review finding #7): counter-extreme prints are guaranteed to contradict an
 * absorption entry right when it confirms — a red flush into a long border IS
 * the volume the passive buyer eats, and the chop that follows is what builds
 * the delta stack.
 *
 * The exception lifts the demotion only when the story is actually about the
 * EVALUATED level, in order of evidence strength:
 *
 * 1. Never while price has EXITED the area: the latest bar closing beyond the
 *    earlier window's accepted closes in the flush direction (below the prior
 *    lowest close for a long, above the prior highest close for a short).
 *    Closes define the area; wicks and tick-sweeps never count as an exit.
 * 2. A stall-CONFIRMED stack in the flush color within
 *    {@link LEVEL_CONTACT_TOLERANCE_PTS} of the level is absorption at the
 *    border — the strongest evidence, consumed directly from the code-owned
 *    scan instead of re-inferred from aggregate counts.
 * 3. Otherwise the flush must at least have CONTACTED the level: some recent
 *    bar traded within tolerance of it. Counter-extremes printed elsewhere in
 *    the window (the pre-feat-085 bypass) no longer qualify.
 */
export function absorbedFlushException(
  direction: 'long' | 'short',
  telemetry: SignGateTelemetry,
  context: AbsorbedFlushContext,
): boolean {
  const { lastClose, priorMinClose, priorMaxClose } = telemetry.recentRange
  if (direction === 'long') {
    if (telemetry.recentRedExtremeCount === 0 || priorMinClose === null) return false
    if (lastClose < priorMinClose - AREA_EXIT_TOLERANCE_PTS) return false
  } else {
    if (telemetry.recentBlueExtremeCount === 0 || priorMaxClose === null) return false
    if (lastClose > priorMaxClose + AREA_EXIT_TOLERANCE_PTS) return false
  }

  const { levelPrice } = context
  if (levelPrice === null) return false

  // The flush color is the aggressor being absorbed: red into a long border,
  // blue into a short border (absorption prints in the aggressor's color).
  const flushSide = direction === 'long' ? 'sell' : 'buy'
  const confirmedStackAtLevel = (context.absorption?.candidates ?? []).some(
    (candidate) =>
      candidate.stall.confirmed &&
      candidate.side === flushSide &&
      distanceToStack(levelPrice, candidate) <= LEVEL_CONTACT_TOLERANCE_PTS,
  )
  if (confirmedStackAtLevel) return true

  return context.recentBars.some(
    (bar) => distanceToBar(levelPrice, bar) <= LEVEL_CONTACT_TOLERANCE_PTS,
  )
}

export interface ValidatedEval {
  result: EvalResult
  /** The `entry_levels.id` the verdict is about, or null (NO_ENTRY_NEAR / position eval). */
  evaluatedLevelId: string | null
  warnings: string[]
}

/**
 * Deterministically rebuild a gate-demoted ENTER as a CONTRACT-COHERENT WAIT
 * (2026-08-02 adversarial review finding #3: flipping only the status enum
 * persisted a WAIT with a null nextSignal, an ENTER-shaped trigger, reason
 * and caution — the headline status and its supporting advisory disagreed at
 * the exact moment the safety gate intervened). The model's checks stay — they
 * are its honest market read and the demotion is code's, surfaced in the
 * warning, the appended reason sentence and the persisted warnings column.
 */
function coherentWaitDemotion(
  entry: EvalResult,
  direction: 'long' | 'short',
  gate: {
    counterCount: number
    entryCount: number
    areaEdge: number | null
    edgeName: string
  },
): EvalResult {
  const counterColor = direction === 'long' ? 'red' : 'blue'
  const entryColor = direction === 'long' ? 'blue' : 'red'
  const recloseSide = direction === 'long' ? 'above' : 'below'
  return {
    ...entry,
    status: 'WAIT',
    trigger: null,
    nextSignal:
      `Price recloses ${recloseSide} the prior close ${gate.edgeName}` +
      `${gate.areaEdge !== null ? ` (${gate.areaEdge})` : ''} with ${entryColor} response at the ` +
      `border while the ${counterColor} extreme cluster stops out-printing the entry side.`,
    revalidationAction: null,
    caution: `Do not enter while one-sided ${counterColor} initiative holds price out of the area.`,
    reason:
      `${entry.reason} Code initiative gate: ${gate.counterCount} counter-extreme vs ` +
      `${gate.entryCount} entry-extreme bars with price closed out of the area — demoted from ` +
      `ENTER to WAIT.`,
  }
}

/**
 * Fail-closed guard on status-changing coercions (feat-083): a coerced result
 * that violates the EvalResult per-status contract is a code bug — persisting
 * it would re-open the incoherent-verdict path the contract closed, so throw
 * instead.
 */
function assertCoercedContract(result: EvalResult, what: string): void {
  const parsed = EvalResult.safeParse(result)
  if (!parsed.success) {
    throw new EvalContractViolationError(
      `${what} produced a contract-violating result: ` +
        parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    )
  }
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
      revalidationAction: null,
      caution: null,
      reason: result.reason,
    }
    assertCoercedContract(result, 'not-near → NO_ENTRY_NEAR coercion')
  }

  // A NO_ENTRY_NEAR against the code-owned near gate is unrepairable: the
  // persisted row would carry nearEntry=true beside status=NO_ENTRY_NEAR and
  // neither field could be trusted downstream (2026-08-02 adversarial review
  // finding #8 — the old path knowingly persisted the contradiction). A
  // coherent level verdict cannot be fabricated in code, so reject and let
  // the task retry.
  if (proximity.nearEntry && result.status === 'NO_ENTRY_NEAR') {
    throw new EvalContractViolationError(
      options.position
        ? `position eval (${options.position}): the model returned NO_ENTRY_NEAR, which does not apply to a position check — rejecting for retry`
        : 'the code-computed gate says an active entry IS near, but the model returned NO_ENTRY_NEAR — rejecting for retry',
    )
  }

  // Position evals: the direction and the current-price evaluated level are
  // code-owned (the operator pressed Long or Short); any model drift on them
  // is overwritten. The FK stays null below — there is no entry_levels row a
  // position check is about.
  if (options.position && result.status !== 'NO_ENTRY_NEAR') {
    const position = options.position
    const echoed = result.evaluatedLevel
    if (
      result.direction !== position ||
      !echoed ||
      echoed.direction !== position ||
      Math.abs(echoed.price - options.currentPrice) > PRICE_EPSILON
    ) {
      warnings.push(
        `position eval: model drifted from the code-owned ${position} @ ${options.currentPrice} evaluated level — overwritten`,
      )
    }
    result = {
      ...result,
      direction: position,
      evaluatedLevel: {
        label: proximity.nearest?.level.label ?? `${position} position`,
        price: options.currentPrice,
        direction: position,
      },
    }
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
        const flushContext: AbsorbedFlushContext = {
          levelPrice:
            result.evaluatedLevel?.price ?? options.proximity.nearest?.level.price ?? null,
          recentBars: options.recentBars,
          absorption: options.absorption,
        }
        if (absorbedFlushException(direction, telemetry, flushContext)) {
          warnings.push(
            `extreme counts run against the ${direction} ENTER (${counterCount} counter-extreme ` +
              `vs ${entryCount} entry-extreme bars), but the flush is being absorbed AT the ` +
              `evaluated level — price has not closed out of the area (last close ` +
              `${telemetry.recentRange.lastClose} vs prior ${edgeName} ${areaEdge}) — ENTER kept`,
          )
        } else {
          const exitedArea =
            areaEdge !== null &&
            (direction === 'long'
              ? telemetry.recentRange.lastClose < areaEdge - AREA_EXIT_TOLERANCE_PTS
              : telemetry.recentRange.lastClose > areaEdge + AREA_EXIT_TOLERANCE_PTS)
          warnings.push(
            `model returned ENTER ${direction} but the extreme counts confirm counter-initiative ` +
              `(${counterCount} counter-extreme vs ${entryCount} entry-extreme bars) and ` +
              (exitedArea
                ? `price has closed out of the area (last close ` +
                  `${telemetry.recentRange.lastClose} vs prior ${edgeName} ${areaEdge})`
                : `no absorption evidence ties the flush to the evaluated level (no ` +
                  `stall-confirmed stack or bar contact within ${LEVEL_CONTACT_TOLERANCE_PTS} pts)`) +
              ` — coerced to WAIT`,
          )
          result = coherentWaitDemotion(result, direction, {
            counterCount,
            entryCount,
            areaEdge,
            edgeName,
          })
          assertCoercedContract(result, 'ENTER→WAIT initiative-gate demotion')
        }
      }
    }
  }

  // The Absorption check is a required condition on every level verdict
  // (feat-072, operator ask 2026-07-30; feat-082 hard-enforces it — with an
  // EXACT name, not a substring — in the EvalResult refinement at generate
  // time). This enforcement-side warning is belt-and-braces for coerced and
  // code-constructed paths that bypass the generate step: fabricating a check
  // the model didn't make would put words in its mouth, so surface, don't fix.
  if (
    result.status !== 'NO_ENTRY_NEAR' &&
    result.checks &&
    !result.checks.some((check) => check.name === 'Absorption')
  ) {
    warnings.push(
      'the verdict carries no check named exactly "Absorption" — review it against the absorption facts',
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
    options.position || result.status === 'NO_ENTRY_NEAR'
      ? null
      : resolveEvaluatedLevelId(result, options, warnings)

  return { result, evaluatedLevelId, warnings }
}
