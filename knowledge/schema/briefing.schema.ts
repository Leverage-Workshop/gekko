import { z } from 'zod'

/**
 * Output contracts (source of truth) for the three model-facing tasks:
 *   - analyze-task → Briefing
 *   - update-task  → BriefingUpdate
 *   - eval-task    → EvalResult
 *
 * These mirror the "Output contract" section of docs/agent-architecture-plan.md.
 * The Zod schemas are passed to the AI SDK `generateObject` call so the model is
 * constrained to this shape, and used again to validate the response before
 * persistence. The deterministic engine supplies/validates facts (terrain
 * borders, R/R); the model supplies perception and judgment only.
 */

// --- shared enums -----------------------------------------------------------

export const Direction = z.enum(['long', 'short'])
export type Direction = z.infer<typeof Direction>

/** terrain.levels classification (engine + model). */
export const LevelKind = z.enum(['trench', 'wall', 'magnet', 'mgi'])
export type LevelKind = z.infer<typeof LevelKind>

/**
 * Objective target rungs. Doctrine is the two-target T1→T2 ladder (2026-07-26 —
 * T2 is the move's realistic conclusion, T1 a structure rung near the middle of
 * the entry→T2 traverse); 'T3' stays parseable ONLY because persisted briefings
 * are re-read through this schema (dashboardData / updateBundle safeParse) and
 * historical rows carry the old three-rung ladder. New generations must not
 * emit it — validateBriefing trims any third rung.
 */
export const TargetLabel = z.enum(['T1', 'T2', 'T3'])
export type TargetLabel = z.infer<typeof TargetLabel>

/** eval-task disposition at the current price. */
export const EvalStatus = z.enum(['ENTER', 'WAIT', 'NOT_VALID', 'NO_ENTRY_NEAR'])
export type EvalStatus = z.infer<typeof EvalStatus>

// --- Briefing ---------------------------------------------------------------

export const KeyInflection = z.object({
  level: z.number(),
  why: z.string(),
})
export type KeyInflection = z.infer<typeof KeyInflection>

/**
 * One Tactical Overview section (feat-068, 2026-07-29): a time-ordered
 * narrative paragraph plus the few points that data surfaces. `narrative`
 * walks the timeframe chronologically (operator ask: "a paragraph giving a
 * time-based description of what's occurred"); `keyPoints` are the distilled
 * takeaways, NOT a restatement — floor of 2 (gem-comparison F6: single-bullet
 * sections read as sparse), ceiling of 4 (attention economy; the narrative now
 * carries the description, so the feat-060 ceiling of 5 comes down one).
 * `minItems`/`maxItems` are proven safe under OpenAI strict structured
 * outputs; string length floors are deliberately NOT schema-enforced (the
 * prompt owns narrative substance).
 */
export const OverviewSection = z.object({
  narrative: z.string(),
  keyPoints: z.array(z.string()).min(2).max(4),
})
export type OverviewSection = z.infer<typeof OverviewSection>

/**
 * Tactical Overview: three timeframe-descending sections — HTF view (value
 * migration, daily-range contraction/expansion, HTF trend), MTF view (the
 * last few days day-by-day), Current (overnight session, then the RTH session
 * so far) — each a narrative + key points (feat-068; section split feat-060).
 */
export const Overview = z.object({
  htfView: OverviewSection,
  mtfView: OverviewSection,
  current: OverviewSection,
})
export type Overview = z.infer<typeof Overview>

/**
 * feat-060..feat-067 overview shape (three bullet arrays) — HISTORICAL ROWS
 * ONLY, never generated. Stays parseable for the same reason 'T3' does (see
 * {@link TargetLabel}): persisted briefings are re-read through the schema
 * (dashboardData / updateBundle safeParse) and rows from that window carry
 * this shape.
 */
export const BulletOverview = z.object({
  htfView: z.array(z.string()).min(2).max(5),
  mtfView: z.array(z.string()).min(2).max(5),
  current: z.array(z.string()).min(2).max(5),
})
export type BulletOverview = z.infer<typeof BulletOverview>

/**
 * Pre-feat-060 overview shape — HISTORICAL ROWS ONLY, never generated. Stays
 * parseable for the same reason 'T3' does (see {@link TargetLabel}): persisted
 * briefings are re-read through the schema (dashboardData / updateBundle
 * safeParse) and old rows carry this shape. `keyInflections` was never
 * rendered by the UI.
 */
export const LegacyOverview = z.object({
  currentPosition: z.array(z.string()).min(2),
  structuralArchitecture: z.array(z.string()).min(2),
  orderFlowContext: z.array(z.string()).min(2),
  keyInflections: z.array(KeyInflection).min(1).max(2),
})
export type LegacyOverview = z.infer<typeof LegacyOverview>

/** What a persisted `overview` column/payload may hold: current or a historical shape. */
export const PersistedOverview = z.union([Overview, BulletOverview, LegacyOverview])
export type PersistedOverview = z.infer<typeof PersistedOverview>

/** Contiguous Stratosphere→Abyss zone (top > bottom). Borders engine-validated. */
export const TerrainZone = z.object({
  color: z.string(),
  top: z.number(),
  bottom: z.number(),
  label: z.string(),
})
export type TerrainZone = z.infer<typeof TerrainZone>

export const TerrainLevel = z.object({
  price: z.number(),
  label: z.string(),
  kind: LevelKind,
})
export type TerrainLevel = z.infer<typeof TerrainLevel>

export const Terrain = z.object({
  zones: z.array(TerrainZone),
  levels: z.array(TerrainLevel),
})
export type Terrain = z.infer<typeof Terrain>

export const Entry = z.object({
  label: z.string(),
  price: z.number(),
  trigger: z.string(),
})
export type Entry = z.infer<typeof Entry>

export const Stop = z.object({
  label: z.string(),
  price: z.number(),
  invalidation: z.string(),
})
export type Stop = z.infer<typeof Stop>

export const Target = z.object({
  label: TargetLabel,
  price: z.number(),
  description: z.string(),
})
export type Target = z.infer<typeof Target>

// NOTE (2026-07-17): entries/stops/targets are `.min(1)` — an Objective with
// an empty array is geometrically meaningless (riskReward.ts throws "no entry
// price"), and gpt-5.6-terra emitted `entries: []` on a live secondary
// objective. `minItems` is accepted by OpenAI strict structured outputs (the
// existing keyInflections `.min(1).max(2)` proves it), so the constraint
// binds at generation time, not just at parse.
// NOTE (2026-07-18): single-entry doctrine — each objective carries exactly
// ONE entry and ONE stop (Entry B rungs are never traded). The ceiling is
// enforced by the prompt plus validateBriefing's enforceSingleEntry trim, not
// a schema `.max(1)`, so a drifting model degrades to a warning instead of a
// generation-time schema failure.
// NOTE (2026-07-26): two-target doctrine — at most TWO targets (T1 → T2). The
// ceiling follows the same pattern (prompt + validateBriefing's
// enforceTargetCeiling trim, no schema `.max(2)`): historical briefings with
// the old T1→T2→T3 ladder must keep parsing on the dashboard/update read path.
// NOTE (2026-08-01, feat-076): one-or-two-rung contract — the single-target
// variant is first-class: when the map offers no rung between entry and the
// conclusion, `targets` carries one rung labeled T2 (the conclusion the R/R
// gate measures to). enforceTargetCeiling relabels a sole T1 to T2 so
// riskReward's "last listed target" gate always measures the conclusion.
// NOTE (2026-08-01, feat-077): these `.min(1)` floors bind the TRADE variant
// only — explicit abstention is its own union branch ({@link NoTradeObjective}
// via {@link ObjectiveSlot}), never an Objective with hollowed-out arrays.
export const Objective = z.object({
  macroGoal: z.string(),
  rationale: z.string(),
  direction: Direction,
  entries: z.array(Entry).min(1),
  stops: z.array(Stop).min(1),
  targets: z.array(Target).min(1),
  /** Risk/reward ratio: entry→T2 (conclusion) distance vs the fixed 25-pt operational stop; supplied by riskReward.ts (the rr_min gate). */
  rr: z.number(),
})
export type Objective = z.infer<typeof Objective>

/**
 * Why an objective slot ships no trade (feat-077, Codex adversarial-review
 * finding #1: with no abstention path the model fabricated complete objectives
 * — distant qualifying targets, disguised missing evidence — under the
 * "both objectives must carry entries/stops/targets" contract).
 */
export const NoTradeReasonCode = z.enum([
  /** No entry→T2 geometry on the engine map clears the R/R gate. */
  'no-qualifying-structure',
  /** The evidence for any setup is absent or too thin to commit. */
  'insufficient-evidence',
  /** A real setup exists but its activating condition has not occurred and cannot be expressed as a concrete entry trigger yet. */
  'not-yet-actionable',
  /** Signals materially conflict (e.g. structure vs initiative) with no resolution. */
  'conflicting-signals',
])
export type NoTradeReasonCode = z.infer<typeof NoTradeReasonCode>

/**
 * Explicit abstention for an objective slot (feat-077): the model declares
 * there is no trade instead of fabricating entries/stops/targets. `noTrade` is
 * the discriminator (a literal, so a trade objective can never half-morph into
 * an abstention); `macroGoal` stays the 1-line headline ("Stand aside — …")
 * and `rationale` must say what evidence is missing and what would change the
 * verdict. No entries, stops, targets or rr — validation skips every
 * per-objective gate for an abstaining slot, and persistence arms no
 * entry_levels rows for it.
 */
export const NoTradeObjective = z.object({
  noTrade: z.literal(true),
  reasonCode: NoTradeReasonCode,
  macroGoal: z.string(),
  rationale: z.string(),
})
export type NoTradeObjective = z.infer<typeof NoTradeObjective>

/**
 * What a briefing's `primary`/`secondary` slot may hold: a full trade
 * {@link Objective} or an explicit {@link NoTradeObjective} abstention.
 * {@link Objective} is listed first so every historical row keeps parsing
 * exactly as before; the branches cannot collide ({@link Objective} requires
 * `entries`, {@link NoTradeObjective} requires the `noTrade` literal).
 * Strict-structured-outputs safe: unions emit `anyOf` with every branch
 * object fully required (guarded by the walker in
 * tests/briefing.schema.test.ts).
 */
export const ObjectiveSlot = z.union([Objective, NoTradeObjective])
export type ObjectiveSlot = z.infer<typeof ObjectiveSlot>

/** Narrowing guard for an abstaining slot — the discriminator is the `noTrade` literal. */
export function isNoTrade(slot: ObjectiveSlot): slot is NoTradeObjective {
  return 'noTrade' in slot && slot.noTrade === true
}

export const DangerZone = z.object({
  area: z.string(),
  why: z.string(),
})
export type DangerZone = z.infer<typeof DangerZone>

/**
 * Active Pattern Scan verdict (feat-078, Codex adversarial-review finding #3):
 * the doctrine playbook scan of the execution chart. Formerly a mandatory
 * BINARY present/absent keyPoint — with no honest middle state, an ambiguous
 * or low-quality chart pressured hallucinated visual evidence that bypassed
 * every validation gate. `indeterminate` is the correct verdict whenever the
 * screenshot does not support a confident call either way.
 */
export const PatternVerdict = z.enum(['present', 'absent', 'indeterminate'])
export type PatternVerdict = z.infer<typeof PatternVerdict>

export const PatternScan = z.object({
  verdict: PatternVerdict,
  /**
   * The doctrine playbook pattern when `verdict` is 'present' (e.g.
   * "Failed Breakout Trap"); null on 'absent'/'indeterminate' — enforced by
   * validateBriefing (present without a name is a hard, retryable failure).
   */
  pattern: z.string().nullable(),
  /** Where it fired and what confirms it — or why the read is absent/indeterminate. */
  evidence: z.string(),
})
export type PatternScan = z.infer<typeof PatternScan>

export const BriefingMeta = z.object({
  createdAt: z.string(),
  triggerReason: z.string(),
  currentPrice: z.number(),
  htfTrend: z.string(),
  ripStatus: z.string(),
})
export type BriefingMeta = z.infer<typeof BriefingMeta>

/**
 * Read-path meta for PERSISTED rows (feat-067): `intradayTrend` is the
 * code-owned composite intraday trend summary (summarizeIntradayTrend),
 * stamped by enforceMeta after generation — never model-emitted, so it lives
 * off the generation contract ({@link BriefingMeta}) and is `.optional()`
 * only because pre-feat-067 rows lack the key. Read-path-only schemas are
 * exempt from the strict-structured-outputs "no optionals" rule.
 */
export const PersistedBriefingMeta = BriefingMeta.extend({
  intradayTrend: z.string().optional(),
})
export type PersistedBriefingMeta = z.infer<typeof PersistedBriefingMeta>

export const Briefing = z.object({
  meta: BriefingMeta,
  overview: Overview,
  terrain: Terrain,
  /** feat-078: the structured Active Pattern Scan (tristate + evidence). */
  patternScan: PatternScan,
  primary: ObjectiveSlot,
  secondary: ObjectiveSlot,
  dangerZones: z.array(DangerZone),
})
export type Briefing = z.infer<typeof Briefing>

/**
 * Read-path variant of {@link Briefing} for PERSISTED rows (dashboard render,
 * update-task parent parse): identical except `overview` also accepts the
 * historical shapes (feat-060 bullet arrays, pre-feat-060 legacy) and `meta`
 * carries the code-stamped `intradayTrend` (feat-067). Never passed to a
 * model — the generation contract stays {@link Briefing}, so the
 * strict-structured-outputs walker never sees the union or the optional.
 */
export const PersistedBriefing = Briefing.extend({
  overview: PersistedOverview,
  meta: PersistedBriefingMeta,
  /**
   * `.optional()` only because pre-feat-078 rows lack the key (read-path-only
   * schemas are exempt from the strict-structured-outputs "no optionals" rule
   * — see {@link PersistedBriefingMeta}).
   */
  patternScan: PatternScan.optional(),
})
export type PersistedBriefing = z.infer<typeof PersistedBriefing>

// --- BriefingUpdate ---------------------------------------------------------

/**
 * The Gem "Update" prompt's Immediate Tactical Read — three 1-line prose
 * reads. `ripStatus` here is the model's narrative read ("Holding as support")
 * and is distinct from the code-owned condition in `meta.ripStatus`.
 */
export const TacticalRead = z.object({
  /** Current zone + immediate borders above/below. */
  location: z.string(),
  /** e.g. "Holding as support" / "Breached" / "Flipped to resistance". */
  ripStatus: z.string(),
  /** Who has control based on current delta/telemetry. */
  initiative: z.string(),
})
export type TacticalRead = z.infer<typeof TacticalRead>

/**
 * update-task output: the Gem's "Update" — Immediate Tactical Read + a fresh
 * Strategic Alignment (primary / secondary / danger zones). No overview or
 * terrain: those carry forward from the parent briefing, and persistence
 * composes a full {@link Briefing} from parent + update before writing
 * `raw_model_json`.
 */
export const BriefingUpdate = z.object({
  meta: BriefingMeta,
  tacticalRead: TacticalRead,
  /** feat-078: re-run against the CURRENT execution chart, never inherited. */
  patternScan: PatternScan,
  primary: ObjectiveSlot,
  secondary: ObjectiveSlot,
  dangerZones: z.array(DangerZone),
})
export type BriefingUpdate = z.infer<typeof BriefingUpdate>

// --- EvalResult -------------------------------------------------------------

// NOTE (2026-07-16): every "absent" field below is `.nullable()`, never
// `.optional()` — OpenAI strict structured outputs (the triage model's
// endpoint) require every key in each object's `required` array; a key that
// can be missing is rejected before the call runs. Anthropic tolerated
// optionals, OpenAI does not. Guarded by the strict-mode walker in
// tests/briefing.schema.test.ts.

export const EvalMeta = z.object({
  createdAt: z.string(),
  currentPrice: z.number(),
  nearEntry: z.boolean(),
  zone: z.string().nullable(),
})
export type EvalMeta = z.infer<typeof EvalMeta>

export const EvaluatedLevel = z.object({
  label: z.string(),
  price: z.number(),
  direction: Direction,
})
export type EvaluatedLevel = z.infer<typeof EvaluatedLevel>

/** One named entry condition: pass (supports), fail (against), pending (not yet). */
export const EvalCheckVerdict = z.enum(['pass', 'fail', 'pending'])
export type EvalCheckVerdict = z.infer<typeof EvalCheckVerdict>

export const EvalCheck = z.object({
  name: z.string(),
  verdict: EvalCheckVerdict,
  note: z.string(),
})
export type EvalCheck = z.infer<typeof EvalCheck>

/** Bounds for the per-verdict condition checks (also enforced in the refinement). */
export const EVAL_CHECKS_MIN = 3
export const EVAL_CHECKS_MAX = 6

/**
 * The status-discriminated verdict contract (2026-08-02 adversarial eval
 * review findings #2/#4/#6). The object stays FLAT for the provider — OpenAI
 * strict structured outputs reject a root-level union — and the per-status
 * field matrix is enforced by the refinement below, so a contract-violating
 * output fails `schema.parse` in the generate step and the run retries
 * instead of persisting an incoherent verdict:
 *
 * - `ENTER`       — evaluatedLevel/direction/trigger + checks; nextSignal and
 *                   revalidationAction null. The trigger names the confirming
 *                   pattern visible NOW, never a hypothetical.
 * - `WAIT`        — evaluatedLevel/direction + checks + nextSignal (the one
 *                   observable that authorizes the level); trigger and
 *                   revalidationAction null. The level stays armed.
 * - `NOT_VALID`   — evaluatedLevel/direction + checks + revalidationAction
 *                   (what to do instead — the level is dead and cannot flip
 *                   to ENTER on one print); trigger/stop/targets/nextSignal
 *                   null.
 * - `NO_ENTRY_NEAR` — every level field null.
 *
 * Every level verdict carries 3–6 uniquely-named checks, one named exactly
 * "Absorption".
 */
const EvalResultShape = z.object({
  meta: EvalMeta,
  status: EvalStatus,
  evaluatedLevel: EvaluatedLevel.nullable(),
  direction: Direction.nullable(),
  /** ENTER only: the presently-visible confirming pattern. Null otherwise. */
  trigger: z.string().nullable(),
  stop: z.number().nullable(),
  targets: z.array(z.number()).nullable(),
  /**
   * The reason decomposed into named conditions (Structure, Delta,
   * Absorption, …). Null on level-less NO_ENTRY_NEAR verdicts.
   */
  checks: z.array(EvalCheck).nullable(),
  /** WAIT only: the single concrete signal that authorizes the level. */
  nextSignal: z.string().nullable(),
  /**
   * NOT_VALID only: the advisory next step now that the level is dead
   * (e.g. "Run an Update after new structure forms below 28100").
   */
  revalidationAction: z.string().nullable(),
  /** One line of what NOT to do right now (e.g. "do not chase into the void"). */
  caution: z.string().nullable(),
  reason: z.string(),
})

type EvalResultRaw = z.infer<typeof EvalResultShape>

/** The exact required check name — substring lookalikes do not satisfy it. */
export const ABSORPTION_CHECK_NAME = 'Absorption'

function checkEvalVerdictContract(result: EvalResultRaw, ctx: z.RefinementCtx): void {
  const issue = (path: string, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message })
  const mustBeNull = (path: keyof EvalResultRaw) => {
    if (result[path] !== null) issue(path, `${path} must be null on a ${result.status} verdict`)
  }

  if (result.status === 'NO_ENTRY_NEAR') {
    for (const path of [
      'evaluatedLevel',
      'direction',
      'trigger',
      'stop',
      'targets',
      'checks',
      'nextSignal',
      'revalidationAction',
    ] as const) {
      mustBeNull(path)
    }
    return
  }

  // Level verdicts (ENTER / WAIT / NOT_VALID): the level identity and the
  // structured justification are mandatory.
  if (result.evaluatedLevel === null) issue('evaluatedLevel', 'level verdicts must name the evaluated level')
  if (result.direction === null) issue('direction', 'level verdicts must carry a direction')
  const checks = result.checks
  if (checks === null || checks.length < EVAL_CHECKS_MIN || checks.length > EVAL_CHECKS_MAX) {
    issue(
      'checks',
      `level verdicts carry ${EVAL_CHECKS_MIN}–${EVAL_CHECKS_MAX} named checks (got ${checks?.length ?? 'null'})`,
    )
  }
  if (checks !== null) {
    if (new Set(checks.map((check) => check.name)).size !== checks.length) {
      issue('checks', 'check names must be unique')
    }
    if (!checks.some((check) => check.name === ABSORPTION_CHECK_NAME)) {
      issue('checks', `one check must be named exactly "${ABSORPTION_CHECK_NAME}"`)
    }
  }

  if (result.status === 'ENTER') {
    if (result.trigger === null) issue('trigger', 'ENTER must name the presently-visible confirming trigger')
    mustBeNull('nextSignal')
    mustBeNull('revalidationAction')
  } else if (result.status === 'WAIT') {
    if (result.nextSignal === null) issue('nextSignal', 'WAIT must name the authorizing signal')
    mustBeNull('trigger')
    mustBeNull('revalidationAction')
  } else {
    // NOT_VALID: the plan is dead — no actionable entry geometry survives.
    if (result.revalidationAction === null) {
      issue('revalidationAction', 'NOT_VALID must state the advisory next step')
    }
    mustBeNull('trigger')
    mustBeNull('stop')
    mustBeNull('targets')
    mustBeNull('nextSignal')
  }
}

export const EvalResult = EvalResultShape.superRefine(checkEvalVerdictContract)
export type EvalResult = z.infer<typeof EvalResult>
