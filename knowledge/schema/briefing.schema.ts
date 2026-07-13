import { z } from 'zod'

/**
 * Output contracts (source of truth) for the two model-facing tasks:
 *   - analyze-task → Briefing
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
  currentPosition: z.array(z.string()),
  structuralArchitecture: z.array(z.string()),
  orderFlowContext: z.array(z.string()),
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

export const Objective = z.object({
  macroGoal: z.string(),
  rationale: z.string(),
  direction: Direction,
  entries: z.array(Entry),
  stops: z.array(Stop),
  targets: z.array(Target),
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

// --- EvalResult -------------------------------------------------------------

export const EvalMeta = z.object({
  createdAt: z.string(),
  currentPrice: z.number(),
  nearEntry: z.boolean(),
  zone: z.string().optional(),
})
export type EvalMeta = z.infer<typeof EvalMeta>

export const EvaluatedLevel = z.object({
  label: z.string(),
  price: z.number(),
  direction: Direction,
})
export type EvaluatedLevel = z.infer<typeof EvaluatedLevel>

export const EvalResult = z.object({
  meta: EvalMeta,
  status: EvalStatus,
  evaluatedLevel: EvaluatedLevel.optional(),
  direction: Direction.optional(),
  trigger: z.string().optional(),
  stop: z.number().optional(),
  targets: z.array(z.number()).optional(),
  reason: z.string(),
})
export type EvalResult = z.infer<typeof EvalResult>
