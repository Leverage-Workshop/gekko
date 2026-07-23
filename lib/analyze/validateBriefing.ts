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

/**
 * A protective stop closer than this to entry sits inside the entry's own composite border
 * band (feat-042 — the 2026-07-18 loop-2 briefing stopped 2.25 pts away, on the other member
 * of the same PDL/VRange−2 band): noise risk that turns the engine R/R into fiction.
 */
const MIN_STRUCTURAL_STOP_PTS = 5

/**
 * Minimum separation between the primary and secondary Entry A prices. Closer than this
 * the two objectives straddle one border ("short the reoffer / long the hold" at the same
 * level — 3 of 5 briefings on 2026-07-20 did exactly this), which is a coin-flip at one
 * line, not two scenarios, and plants opposite-direction `entry_levels` rows at the same
 * price — the geometry that broke the eval-task's level selection (see enforceSingleEntry).
 */
export const MIN_OBJECTIVE_ENTRY_SEPARATION_PTS = 5

/**
 * Minimum distance between a fresh briefing's Entry A and the code-owned current price.
 * Relaxed from 15 to 1 (2026-07-20 operator decision): entries near price are allowed
 * again; the gate now only rejects an entry pinned exactly where price already trades.
 * Enforced only for fresh analyze generations (`enforceEntryStandoff`) — an update
 * revising a standing plan must NOT be rejected just because price has since approached
 * the planned entry (that is the trade working, and it is exactly when updates fire).
 */
export const MIN_ENTRY_STANDOFF_PTS = 1

/**
 * Maximum distance an entry may sit on the CHASE side of the code-owned current price —
 * above price for a long, below price for a short. Doctrine entries are pullback anchors
 * (the rebid/reclaimed border below for a long, the failed border overhead for a short),
 * so an entry beyond price in the trade direction is the forbidden breakout/breakdown
 * chase (2026-07-23: a fresh briefing shipped a long 30 pts above current price). The
 * allowance covers the contested-border case, where the anchor may sit marginally beyond
 * price while the fight straddles the level. Hard-enforced for fresh analyze generations
 * (`enforceEntryStandoff`); advisory for updates, whose standing entries price may have
 * legitimately traded through since the plan was made.
 */
export const MAX_ENTRY_CHASE_PTS = 5

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
  /**
   * Every engine price an entry may legitimately anchor on (zone borders, level
   * verdicts, composite band members — data edges excluded). When present, an
   * entry matching none of them draws an advisory warning.
   */
  anchorPrices?: readonly number[]
  /**
   * Hard-enforce the fresh-map entry placement gates against `meta.currentPrice`:
   * {@link MIN_ENTRY_STANDOFF_PTS} (not pinned at price) and
   * {@link MAX_ENTRY_CHASE_PTS} (not beyond price in the trade direction).
   * Set by the analyze task (fresh map); left off by the update task, whose
   * standing entries price is SUPPOSED to approach — there the chase gate
   * demotes to an advisory warning and the standoff gate is skipped entirely.
   */
  enforceEntryStandoff?: boolean
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

/**
 * Single-entry doctrine (2026-07-18): the operator trades Entry A only — Entry B rungs are
 * never taken, and opposite-direction rungs colliding at a shared border price (primary
 * Add-on short vs secondary Fade long at the same level) broke the eval-task's level
 * selection. Any extra rungs and their stops are trimmed here before R/R recompute and
 * persistence, keeping the Entry A-labeled rung (first entry otherwise) and the worst-case
 * protective stop for it.
 */
function enforceSingleEntry(
  name: 'primary' | 'secondary',
  objective: Objective,
  warnings: string[],
): Objective {
  let entries = objective.entries
  if (entries.length > 1) {
    const kept = entries.find((entry) => /^entry a\b/i.test(entry.label)) ?? entries[0]
    warnings.push(
      `${name} objective emitted ${entries.length} entries — single-entry doctrine keeps "${kept.label}" @ ${kept.price} and drops the rest`,
    )
    entries = [kept]
  }
  let stops = objective.stops
  if (stops.length > 1) {
    const entry = entries[0].price
    const long = objective.direction === 'long'
    const protective = stops.filter((stop) =>
      long ? stop.price < entry : stop.price > entry,
    )
    const kept =
      protective.length > 0
        ? protective.reduce((worst, stop) =>
            Math.abs(entry - stop.price) > Math.abs(entry - worst.price) ? stop : worst,
          )
        : stops[0]
    warnings.push(
      `${name} objective emitted ${stops.length} stops — single-entry doctrine keeps "${kept.label}" @ ${kept.price} and drops the rest`,
    )
    stops = [kept]
  }
  if (entries === objective.entries && stops === objective.stops) {
    return objective
  }
  return { ...objective, entries, stops }
}

/**
 * Distinct-anchor invariant (2026-07-20): the two objectives must anchor at different
 * structural borders. Runs after single-entry trimming so it compares the surviving
 * Entry A rungs.
 *
 * @throws {BriefingValidationError} when the entries sit within
 *   {@link MIN_OBJECTIVE_ENTRY_SEPARATION_PTS} of each other.
 */
function assertDistinctObjectiveAnchors(primary: Objective, secondary: Objective): void {
  const primaryEntry = primary.entries[0]
  const secondaryEntry = secondary.entries[0]
  const gap = Math.abs(primaryEntry.price - secondaryEntry.price)
  if (gap < MIN_OBJECTIVE_ENTRY_SEPARATION_PTS) {
    throw new BriefingValidationError(
      `primary (${primary.direction} @ ${primaryEntry.price}) and secondary (${secondary.direction} @ ${secondaryEntry.price}) entries are ${gap} pts apart — objectives must anchor at distinct structural borders (min ${MIN_OBJECTIVE_ENTRY_SEPARATION_PTS} pts), not straddle one level`,
    )
  }
}

/**
 * Entry-standoff invariant (2026-07-20, analyze task only): a fresh briefing's entry must
 * sit at least {@link MIN_ENTRY_STANDOFF_PTS} from the code-owned current price.
 *
 * @throws {BriefingValidationError} on an entry pinned at/near current price.
 */
function assertEntryStandoff(
  name: 'primary' | 'secondary',
  objective: Objective,
  currentPrice: number,
): void {
  const entry = objective.entries[0]
  const distance = Math.abs(entry.price - currentPrice)
  if (distance < MIN_ENTRY_STANDOFF_PTS) {
    throw new BriefingValidationError(
      `${name} entry "${entry.label}" @ ${entry.price} is ${distance} pts from current price ${currentPrice} — a fresh briefing entry must stand off at least ${MIN_ENTRY_STANDOFF_PTS} pts (anchor the next structural border; the live decision at a contested level belongs to the eval)`,
    )
  }
}

/**
 * Chase-side invariant (2026-07-23): an entry may not sit more than
 * {@link MAX_ENTRY_CHASE_PTS} beyond the code-owned current price in the trade direction
 * (long above price / short below price) — that is a breakout/breakdown chase, not a
 * pullback anchor. Hard (throws) when `enforceEntryStandoff` is set (fresh analyze map);
 * advisory otherwise (update path: price trading through a standing entry is stale-plan
 * information, not grounds to reject the revision).
 *
 * @throws {BriefingValidationError} in hard mode, on an entry beyond the chase allowance.
 */
function enforceEntryChaseSide(
  name: 'primary' | 'secondary',
  objective: Objective,
  currentPrice: number,
  hard: boolean,
  warnings: string[],
): void {
  const entry = objective.entries[0]
  const long = objective.direction === 'long'
  const chase = long ? entry.price - currentPrice : currentPrice - entry.price
  if (chase <= MAX_ENTRY_CHASE_PTS) return
  const finding =
    `${name} ${objective.direction} entry "${entry.label}" @ ${entry.price} sits ${chase} pts ` +
    `${long ? 'above' : 'below'} current price ${currentPrice} — a ` +
    `${long ? 'breakout' : 'breakdown'} chase, not a pullback anchor: a long anchors at/below ` +
    `price, a short at/above (max ${MAX_ENTRY_CHASE_PTS} pts beyond price, for a contested border)`
  if (hard) {
    throw new BriefingValidationError(finding)
  }
  warnings.push(finding)
}

/**
 * Advisory: an entry that matches no engine anchor price is free-floating (e.g. the
 * 2026-07-20 18:53 briefing's 28976.54 vs the engine member 28976.13) or sits on a
 * forbidden data edge (excluded from the anchor set upstream).
 */
function offAnchorEntryWarnings(
  name: 'primary' | 'secondary',
  objective: Objective,
  anchorPrices: readonly number[],
  warnings: string[],
): void {
  const entry = objective.entries[0]
  if (!anchorPrices.some((price) => samePrice(price, entry.price))) {
    warnings.push(
      `${name} entry "${entry.label}" @ ${entry.price} matches no engine anchor price — entries must sit on engine structure (a border band member or level verdict)`,
    )
  }
}

/**
 * Target-ladder advisories (feat-041, gem-comparison-2026-07-18 G3): the full T1→T2→T3
 * ladder is expected whenever engine borders offer rungs. Advisory only — never throws.
 */
function ladderWarnings(
  name: 'primary' | 'secondary',
  objective: Objective,
  engineBorders: readonly number[],
  warnings: string[],
): void {
  if (engineBorders.length === 0 || objective.targets.length >= 2) return
  const long = objective.direction === 'long'
  const entry = objective.entries[0].price
  const extreme = long ? Math.max(...engineBorders) : Math.min(...engineBorders)
  const rungs = engineBorders.filter((p) =>
    long ? p > entry && p < extreme : p < entry && p > extreme,
  )
  if (rungs.length >= 2) {
    warnings.push(
      `${name} objective carries ${objective.targets.length} target while ${rungs.length} engine borders lie between entry and the campaign extreme — the T1→T2→T3 ladder is expected`,
    )
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
  if (verdict.risk < MIN_STRUCTURAL_STOP_PTS) {
    warnings.push(
      `${name} objective's protective stop is ${verdict.risk} pts from entry — inside the entry's own border band, not behind structure`,
    )
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

  const primarySingle = enforceSingleEntry('primary', briefing.primary, warnings)
  const secondarySingle = enforceSingleEntry('secondary', briefing.secondary, warnings)

  assertDistinctObjectiveAnchors(primarySingle, secondarySingle)
  if (options.enforceEntryStandoff && options.meta) {
    assertEntryStandoff('primary', primarySingle, options.meta.currentPrice)
    assertEntryStandoff('secondary', secondarySingle, options.meta.currentPrice)
  }
  if (options.meta) {
    const hard = options.enforceEntryStandoff === true
    enforceEntryChaseSide('primary', primarySingle, options.meta.currentPrice, hard, warnings)
    enforceEntryChaseSide('secondary', secondarySingle, options.meta.currentPrice, hard, warnings)
  }
  if (options.anchorPrices && options.anchorPrices.length > 0) {
    offAnchorEntryWarnings('primary', primarySingle, options.anchorPrices, warnings)
    offAnchorEntryWarnings('secondary', secondarySingle, options.anchorPrices, warnings)
  }

  const primary = recomputeObjective('primary', primarySingle, rrMin, warnings)
  const secondary = recomputeObjective('secondary', secondarySingle, rrMin, warnings)

  ladderWarnings('primary', primarySingle, options.engineBorders ?? [], warnings)
  ladderWarnings('secondary', secondarySingle, options.engineBorders ?? [], warnings)

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
