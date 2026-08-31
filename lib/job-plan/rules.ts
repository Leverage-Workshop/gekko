import { R1_MERGE_TOLERANCE, type Instrument } from './profile-vision/instrument'

/**
 * The Job planner's ratified rules (docs/job-planning-task-plan.md, "Ratified
 * rules", 2026-08-22) as NAMED PURE PREDICATES with stable IDs. Every ratified
 * number lives here as a constant; the measurement that feeds a predicate lives
 * in the module that owns the data (classifyContext's helpers for R1–R10/R13,
 * buildPlan for R11/R12, the job-plan task for R14). No runtime doctrine
 * markdown, no rule-catalog abstraction — {@link RULE_TABLE} is the decision
 * log by rule ID, and tests pin it to the plan's table.
 *
 * Ownership split (feat-126 / feat-127 / feat-128): the table declares EVERY
 * R-id in the plan exactly once, with the feature that implements it; the
 * feat-126 rows (R1–R10, R13) and the feat-127 rows (R11, R12) have predicates
 * in this file. R14 is the job-plan task's (feat-128). R15 is proposed, not
 * ratified — its numbers are the vision bench's exit criterion (feat-124) and
 * it never runs inside the planner.
 *
 * Bump {@link PLANNER_REVISION} whenever a number or predicate here changes:
 * it is part of every persisted plan's reproducibility fingerprint.
 */

export const PLANNER_REVISION = 'job-planner/2026-08-31.2'

export type RuleId =
  | 'R1'
  | 'R1b'
  | 'R2'
  | 'R3'
  | 'R4'
  | 'R5'
  | 'R6'
  | 'R7'
  | 'R8'
  | 'R9'
  | 'R10'
  | 'R11'
  | 'R12'
  | 'R13'
  | 'R14'
  | 'R15'

export type RuleOwner = 'feat-126' | 'feat-127' | 'feat-128' | 'feat-124'

export type RuleEntry = {
  readonly id: RuleId
  readonly title: string
  readonly owner: RuleOwner
  /** false = proposed (R15), the operator has not ratified the numbers. */
  readonly ratified: boolean
  /** Predicate exported from this file, when the rule is the planner's (feat-126 / feat-127). */
  readonly predicate: string | null
}

/** Every R-id in the plan's "Ratified rules" table, exactly once. */
export const RULE_TABLE: readonly RuleEntry[] = [
  { id: 'R1', title: 'Confluence band — merge tolerance / chain cap (ES)', owner: 'feat-126', ratified: true, predicate: 'r1SameBand / r1WithinCap' },
  { id: 'R1b', title: 'Confluence band — same, NQ', owner: 'feat-126', ratified: true, predicate: 'resolveBandTolerance' },
  { id: 'R2', title: 'Source significance (band anchor + tie-break)', owner: 'feat-126', ratified: true, predicate: 'r2Significance / r2DestinationOnly' },
  { id: 'R3', title: '"At" a band', owner: 'feat-126', ratified: true, predicate: 'r3AtBand' },
  { id: 'R4', title: 'Within reach (actionable-if-reached vs destination)', owner: 'feat-126', ratified: true, predicate: 'r4WithinReach' },
  { id: 'R5', title: 'Failed look', owner: 'feat-126', ratified: true, predicate: 'r5FailedLook / r5Grade' },
  { id: 'R6', title: 'Build / hold beyond (acceptance)', owner: 'feat-126', ratified: true, predicate: 'r6Accepted' },
  { id: 'R7', title: 'Approach failure', owner: 'feat-126', ratified: true, predicate: 'r7ApproachFailure' },
  { id: 'R8', title: 'Holding side (Rip / G line / box edge)', owner: 'feat-126', ratified: true, predicate: 'r8HoldingSide' },
  { id: 'R9', title: 'Already-interacted', owner: 'feat-126', ratified: true, predicate: 'r9TriggerStatus' },
  { id: 'R10', title: 'Mid-zone ("purgatory")', owner: 'feat-126', ratified: true, predicate: 'r10MidZone' },
  { id: 'R11', title: 'Response deadline (emitted, never evaluated)', owner: 'feat-127', ratified: true, predicate: 'r11ResponseDeadline' },
  { id: 'R12', title: 'Actionable set + origin precedence', owner: 'feat-127', ratified: true, predicate: 'r12SkipBand / r12OriginRank / r12WithinPlayCap' },
  { id: 'R13', title: 'Export skew', owner: 'feat-126', ratified: true, predicate: 'r13ExportSkewExceeded / r13TradingDayMatches' },
  { id: 'R14', title: 'Vision read failure → proceed with warning', owner: 'feat-128', ratified: true, predicate: null },
  { id: 'R15', title: 'Vision exit criterion (bench)', owner: 'feat-124', ratified: false, predicate: null },
]

// ---------------------------------------------------------------------------
// R1 / R1b — confluence bands
// ---------------------------------------------------------------------------

/** R1 (ES 5) / R1b (NQ 20): references closer than this are one band. */
export const MERGE_TOLERANCE_PTS: Readonly<Record<Instrument, number>> = R1_MERGE_TOLERANCE

/** R1 (ES 10) / R1b (NQ 40): a chained cluster wider than this splits at its largest gap. */
export const BAND_WIDTH_CAP_PTS: Readonly<Record<Instrument, number>> = { NQ: 40, ES: 10 }

export type BandTolerance = { readonly merge: number; readonly cap: number }

/** R1b: the per-instrument pair, resolved from the MGI symbol root by the caller. */
export function resolveBandTolerance(instrument: Instrument): BandTolerance {
  return { merge: MERGE_TOLERANCE_PTS[instrument], cap: BAND_WIDTH_CAP_PTS[instrument] }
}

/** R1: two reference prices chain into the same band (inclusive). */
export function r1SameBand(a: number, b: number, merge: number): boolean {
  return Math.abs(a - b) <= merge
}

/** R1: a band's [lowest member, highest member] span is within the cap (inclusive). */
export function r1WithinCap(low: number, high: number, cap: number): boolean {
  return high - low <= cap
}

// ---------------------------------------------------------------------------
// R2 — source significance
// ---------------------------------------------------------------------------

export type ReferenceSource =
  | 'g-line'
  | 'weekly-job-pivot'
  | 'daily-job-pivot'
  | 'jba-edge'
  | 'rip'
  | 'overnight-extreme'
  | 'previous-day-extreme'
  | 'profile-balance'
  | 'profile-rotation'
  | 'autoplot'
  | 'mgi-other'
  | 'weekly-rung'
  | 'daily-rung'

/** R2 order, most significant first. Index = significance rank (lower wins). */
export const SOURCE_SIGNIFICANCE: readonly ReferenceSource[] = [
  'g-line',
  'weekly-job-pivot',
  'daily-job-pivot',
  'jba-edge',
  'rip',
  'overnight-extreme',
  'previous-day-extreme',
  'profile-balance',
  'profile-rotation',
  'autoplot',
  'mgi-other',
  'weekly-rung',
  'daily-rung',
]

/** R2: significance rank of a source (0 = the G line). */
export function r2Significance(source: ReferenceSource): number {
  return SOURCE_SIGNIFICANCE.indexOf(source)
}

/** R2: ladder rungs are destination-only — never trigger anchors. */
export function r2DestinationOnly(source: ReferenceSource): boolean {
  return source === 'weekly-rung' || source === 'daily-rung'
}

// ---------------------------------------------------------------------------
// R3 — "at" a band
// ---------------------------------------------------------------------------

/** R3: inside the band, or within one merge tolerance of its nearer edge (inclusive). */
export function r3AtBand(price: number, low: number, high: number, merge: number): boolean {
  return distanceToBand(price, low, high) <= merge
}

/** 0 inside [low, high]; otherwise the distance to the nearer edge. */
export function distanceToBand(price: number, low: number, high: number): number {
  if (price < low) return low - price
  if (price > high) return price - high
  return 0
}

// ---------------------------------------------------------------------------
// R4 — within reach
// ---------------------------------------------------------------------------

/** R4: at most this many session sigmas from price is reachable. */
export const REACH_SIGMA = 1.0

/**
 * Plain-points stand-in for one session sigma when `computeVolatilityScale`
 * returns null (fewer than three complete RTH sessions in the HTF export). NQ
 * takes the engine's reference sigma (`scaledGates.REFERENCE_SESSION_SIGMA_PTS`,
 * 283 pts, the 2026-08-07 bundle-review median); ES is the R1b ratio (~1/4).
 * Flagged in the context's data quality whenever it is used.
 */
export const REACH_FALLBACK_PTS: Readonly<Record<Instrument, number>> = { NQ: 283, ES: 70 }

/** R4: a band whose nearer edge is within `reachPts` of price (inclusive). */
export function r4WithinReach(distancePts: number, reachPts: number): boolean {
  return distancePts <= reachPts
}

// ---------------------------------------------------------------------------
// R5 — failed look
// ---------------------------------------------------------------------------

/** R5: the first close back must land within this many minutes of the first print beyond. */
export const FAILED_LOOK_MAX_MINUTES = 30

/** R5: an excursion that BEGAN inside the first 90 min of RTH grades EARLY. */
export const EARLY_SESSION_MINUTES = 90

export type FailedLookGrade = 'EARLY' | 'LATE'

/** R5: minutes from the first print beyond the edge to the first close back (inclusive). */
export function r5FailedLook(minutesBeyond: number): boolean {
  return minutesBeyond >= 0 && minutesBeyond <= FAILED_LOOK_MAX_MINUTES
}

/**
 * R5 qualifier: EARLY when the excursion started in [RTH open, open + 90 min);
 * everything else — later in the session AND the overnight — grades LATE (the
 * ratified text says "else LATE"; the fact's `scope` says which it was).
 */
export function r5Grade(excursionStartMs: number, rthOpenMs: number): FailedLookGrade {
  const sinceOpenMs = excursionStartMs - rthOpenMs
  return sinceOpenMs >= 0 && sinceOpenMs < EARLY_SESSION_MINUTES * 60_000 ? 'EARLY' : 'LATE'
}

// ---------------------------------------------------------------------------
// R6 — build / hold beyond
// ---------------------------------------------------------------------------

/** R6: completed closes beyond the band for this long = accepted / building. */
export const ACCEPTANCE_MINUTES = 20

/** R6: single threshold — no testing/building/accepted ladder. */
export function r6Accepted(continuousMinutesBeyond: number): boolean {
  return continuousMinutesBeyond >= ACCEPTANCE_MINUTES
}

// ---------------------------------------------------------------------------
// R7 — approach failure
// ---------------------------------------------------------------------------

/** R7: an approach counts when it came within this many merge tolerances (ES 10 / NQ 40). */
export const APPROACH_ZONE_MULTIPLE = 2

/** R7: … and then retreated at least this many merge tolerances from its closest approach. */
export const RETREAT_MULTIPLE = 1

/** R7: the closest approach must fall inside the last 60 min. */
export const APPROACH_RECENCY_MINUTES = 60

export type ApproachMeasure = {
  /** Gap between the closest print and the band edge, points (> 0 = never touched). */
  readonly closestApproachPts: number
  /** How far the last completed close sits back from that closest print, points. */
  readonly retreatPts: number
  /** asOf − the closest approach's bar timestamp, minutes. */
  readonly minutesSinceClosest: number
}

/** R7: within 2× tolerance without touching, retreated ≥ 1×, closest approach within 60 min. */
export function r7ApproachFailure(measure: ApproachMeasure, merge: number): boolean {
  return (
    measure.closestApproachPts > 0 &&
    measure.closestApproachPts <= APPROACH_ZONE_MULTIPLE * merge &&
    measure.retreatPts >= RETREAT_MULTIPLE * merge &&
    measure.minutesSinceClosest >= 0 &&
    measure.minutesSinceClosest <= APPROACH_RECENCY_MINUTES
  )
}

// ---------------------------------------------------------------------------
// R8 — holding side
// ---------------------------------------------------------------------------

/** R8: the window of completed exec-bar closes that defines the holding side. */
export const HOLDING_WINDOW_MINUTES = 20

export type HoldingSide = 'ABOVE' | 'BELOW' | 'STRADDLING'

/** R8: ABOVE / BELOW when every close is on one side of the band, else STRADDLING. */
export function r8HoldingSide(
  closes: readonly number[],
  low: number,
  high: number,
): HoldingSide | null {
  if (closes.length === 0) return null
  if (closes.every((c) => c > high)) return 'ABOVE'
  if (closes.every((c) => c < low)) return 'BELOW'
  return 'STRADDLING'
}

// ---------------------------------------------------------------------------
// R9 — already-interacted
// ---------------------------------------------------------------------------

export type TriggerStatus = 'fresh' | 'full' | 'demoted'

export type InteractionMeasure = {
  /** Any print inside the band during THIS RTH session (overnight never counts). */
  readonly interactedThisSession: boolean
  /** The band produced a failed look this session. */
  readonly failedLookThisSession: boolean
  /** The band was defended (touched and rejected) this session. */
  readonly defendedThisSession: boolean
}

/**
 * R9: untouched = fresh; touched but it produced a failed look or a defense =
 * full trigger status kept; touched otherwise = demoted (stays a destination).
 */
export function r9TriggerStatus(measure: InteractionMeasure): TriggerStatus {
  if (!measure.interactedThisSession) return 'fresh'
  return measure.failedLookThisSession || measure.defendedThisSession ? 'full' : 'demoted'
}

// ---------------------------------------------------------------------------
// R10 — mid-zone
// ---------------------------------------------------------------------------

/** R10: further than this many merge tolerances from EVERY edge of the enclosing zone. */
export const MID_ZONE_MULTIPLE = 2

/** R10: > 2× tolerance from both edges → purgatory; within it of either edge = edge play. */
export function r10MidZone(distToLowerPts: number, distToUpperPts: number, merge: number): boolean {
  const limit = MID_ZONE_MULTIPLE * merge
  return distToLowerPts > limit && distToUpperPts > limit
}

// ---------------------------------------------------------------------------
// R11 — response deadline (emitted as text, never evaluated)
// ---------------------------------------------------------------------------

/** R11: minutes from arrival at the trigger band within which the response is expected. */
export const RESPONSE_DEADLINE_MINUTES = 30

/** The five-condition play grammar (docs/job-planning-task-plan.md, step 4). */
export type PlayCondition =
  | 'hold-traverse'
  | 'look-and-fail'
  | 'build-beyond-continuation'
  | 'approach-failure'
  | 'mid-zone-two-way'

export type ResponseDeadline = {
  readonly minutes: number
  /** Literal false: the planner states the deadline; the operator judges timing. */
  readonly evaluatedByPlanner: false
  readonly text: string
}

/**
 * R11: every hold/traverse branch carries the 30-min deadline from arrival at
 * its trigger band, EMITTED IN THE PLAN TEXT and never evaluated — no module
 * compares a timestamp against {@link RESPONSE_DEADLINE_MINUTES}. Other
 * conditions carry none.
 */
export function r11ResponseDeadline(condition: PlayCondition, bandLabel: string): ResponseDeadline | null {
  if (condition !== 'hold-traverse') return null
  return {
    minutes: RESPONSE_DEADLINE_MINUTES,
    evaluatedByPlanner: false,
    text: `Expect the response within ${RESPONSE_DEADLINE_MINUTES} min of arrival at ${bandLabel}; if it does not come, re-plan — operator judges timing, the planner does not evaluate this`,
  }
}

// ---------------------------------------------------------------------------
// R12 — actionable set + origin precedence
// ---------------------------------------------------------------------------

/** R12: arm at most this many bands per side, nearest-first. */
export const MAX_ARMED_BANDS_PER_SIDE = 2

/** R12: the emitted plan never carries more branches than this. */
export const MAX_PLAYS = 4

/** The origin facts that can back a primary lean, freshest-first order ratified in R12. */
export type OriginFactKind = 'failed-look' | 'approach-failure' | 'accepted' | 'holding-side' | 'defense'

/** R12: failed look > approach failure > building/accepted > holding side > repeated defense. */
export const ORIGIN_PRECEDENCE: readonly OriginFactKind[] = [
  'failed-look',
  'approach-failure',
  'accepted',
  'holding-side',
  'defense',
]

/** R12: precedence rank of an origin fact (0 = failed look, the strongest). */
export function r12OriginRank(kind: OriginFactKind): number {
  return ORIGIN_PRECEDENCE.indexOf(kind)
}

export type BandArmability = {
  readonly confluence: boolean
  /** The anchor's R2 rank. */
  readonly significance: number
  readonly destinationOnly: boolean
}

/**
 * R12: walking outward, a band with NO confluence AND a lowest-tier source is
 * skipped for the next one. "Lowest tier" = the R2 catch-all `mgi-other` and
 * everything below it; rungs are never armed at all (R2).
 */
export function r12SkipBand(band: BandArmability): boolean {
  if (band.destinationOnly) return true
  return !band.confluence && band.significance >= r2Significance('mgi-other')
}

/** R12: the plan holds at most {@link MAX_PLAYS} branches. */
export function r12WithinPlayCap(count: number): boolean {
  return count <= MAX_PLAYS
}

// ---------------------------------------------------------------------------
// R13 — export skew
// ---------------------------------------------------------------------------

/** R13: any two exports' chart clocks more than this far apart → insufficient. */
export const EXPORT_SKEW_MAX_SECONDS = 5 * 60

/** R13: strictly more than 5 min between any two chart clocks (after each proxy's allowance) fails closed. */
export function r13ExportSkewExceeded(maxSkewSeconds: number): boolean {
  return maxSkewSeconds > EXPORT_SKEW_MAX_SECONDS
}

/** R13: the study's `tradingDay` must be the bundle's session. */
export function r13TradingDayMatches(studyTradingDay: string, bundleTradingDay: string): boolean {
  return studyTradingDay === bundleTradingDay
}

/** The planner's predicates by rule ID (feat-126 + feat-127) — what the "exactly once" test walks. */
export const IMPLEMENTED_RULES = {
  R1: [r1SameBand, r1WithinCap],
  R1b: [resolveBandTolerance],
  R2: [r2Significance, r2DestinationOnly],
  R3: [r3AtBand],
  R4: [r4WithinReach],
  R5: [r5FailedLook, r5Grade],
  R6: [r6Accepted],
  R7: [r7ApproachFailure],
  R8: [r8HoldingSide],
  R9: [r9TriggerStatus],
  R10: [r10MidZone],
  R11: [r11ResponseDeadline],
  R12: [r12SkipBand, r12OriginRank, r12WithinPlayCap],
  R13: [r13ExportSkewExceeded, r13TradingDayMatches],
} as const
