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

/** Objective target rungs T1/T2/T3. */
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

export const Overview = z.object({
  // Gem template floor: two concise bullets per prose section (gem-comparison F6 —
  // single-bullet overviews read as sparse).
  currentPosition: z.array(z.string()).min(2),
  structuralArchitecture: z.array(z.string()).min(2),
  orderFlowContext: z.array(z.string()).min(2),
  // Gem doctrine (ADHD profile): max 2 key areas per briefing.
  keyInflections: z.array(KeyInflection).min(1).max(2),
})
export type Overview = z.infer<typeof Overview>

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
export const Objective = z.object({
  macroGoal: z.string(),
  rationale: z.string(),
  direction: Direction,
  entries: z.array(Entry).min(1),
  stops: z.array(Stop).min(1),
  targets: z.array(Target).min(1),
  /** Risk/reward ratio; supplied by riskReward.ts (the rr_min gate). */
  rr: z.number(),
})
export type Objective = z.infer<typeof Objective>

export const DangerZone = z.object({
  area: z.string(),
  why: z.string(),
})
export type DangerZone = z.infer<typeof DangerZone>

export const BriefingMeta = z.object({
  createdAt: z.string(),
  triggerReason: z.string(),
  currentPrice: z.number(),
  htfTrend: z.string(),
  ripStatus: z.string(),
})
export type BriefingMeta = z.infer<typeof BriefingMeta>

export const Briefing = z.object({
  meta: BriefingMeta,
  overview: Overview,
  terrain: Terrain,
  primary: Objective,
  secondary: Objective,
  dangerZones: z.array(DangerZone),
})
export type Briefing = z.infer<typeof Briefing>

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
  primary: Objective,
  secondary: Objective,
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

export const EvalResult = z.object({
  meta: EvalMeta,
  status: EvalStatus,
  evaluatedLevel: EvaluatedLevel.nullable(),
  direction: Direction.nullable(),
  trigger: z.string().nullable(),
  stop: z.number().nullable(),
  targets: z.array(z.number()).nullable(),
  /**
   * The reason decomposed into named conditions (Structure, Delta,
   * Absorption, …). Null on level-less NO_ENTRY_NEAR verdicts.
   */
  checks: z.array(EvalCheck).nullable(),
  /** The single concrete signal that would flip a WAIT/NOT_VALID to ENTER. */
  nextSignal: z.string().nullable(),
  /** One line of what NOT to do right now (e.g. "do not chase into the void"). */
  caution: z.string().nullable(),
  reason: z.string(),
})
export type EvalResult = z.infer<typeof EvalResult>
