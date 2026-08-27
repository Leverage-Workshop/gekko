import { z } from 'zod'
import { PlanStatus } from '@/knowledge/schema/job-plan.schema'
import { NODE_KINDS, NODE_POSITIONS, NODE_SHAPES, PROFILE_SHAPES } from '../profile-vision/schema'
import { PROFILE_KEYS } from '../profile-vision/types'

/**
 * Boundary schemas for the Job plan surface (feat-129): the `job_plans` row
 * as the dashboard reads it, the persisted `profile_nodes` jsonb, and the
 * slice of feat-126's `JobContext` the card renders. The context is validated
 * loosely by `JobPlanSchema` (the planner module owns its detail); the card
 * needs typed access to the dimensions it shows, so those are pinned here —
 * a field the card renders is a field the boundary checks.
 */

const finite = z.number().finite()

/** The `job_plans` columns the dashboard consumes (jsonb columns arrive unknown). */
export const JobPlanRowSchema = z.object({
  id: z.string().min(1),
  created_at: z.string().min(1),
  bundle_id: z.string().min(1),
  trading_day: z.string().min(1),
  trigger_reason: z.string(),
  status: PlanStatus,
  planner_revision: z.string(),
  input_fingerprint: z.string(),
  run_id: z.string(),
  plan: z.unknown(),
  warnings: z.unknown(),
  profile_nodes: z.unknown(),
})
export type JobPlanRow = z.infer<typeof JobPlanRowSchema>

// --- profile_nodes ------------------------------------------------------------

const ConsensusNodeSchema = z.object({
  kind: z.enum(NODE_KINDS),
  priceLow: finite,
  priceHigh: finite,
  prominence: z.number().int(),
  primary: z.boolean(),
  position: z.enum(NODE_POSITIONS),
  shape: z.enum(NODE_SHAPES),
  agreement: z.number().int().min(0),
  samples: z.number().int().min(1),
})
export type PersistedConsensusNode = z.infer<typeof ConsensusNodeSchema>

const ConsensusThinZoneSchema = z.object({
  low: finite,
  high: finite,
  agreement: z.number().int().min(0),
  samples: z.number().int().min(1),
})

const ProfileConsensusSchema = z.object({
  nodes: z.array(ConsensusNodeSchema),
  thinZones: z.array(ConsensusThinZoneSchema),
  profileShape: z.enum(PROFILE_SHAPES),
  unfinished: z.boolean(),
  successfulSamples: z.number().int().min(0),
  samples: z.number().int().min(1),
})

const RawSampleSchema = z.looseObject({
  sample: z.number().int(),
  tile: z.number().int(),
  imageSha256: z.string(),
  ok: z.boolean(),
  error: z.string().nullable(),
  latencyMs: z.number().nullable(),
  cost: z.number().nullable(),
})

const TileSpanSchema = z.object({
  index: z.number().int(),
  of: z.number().int(),
  priceLow: finite,
  priceHigh: finite,
  rows: z.number().int(),
})

/** The persisted `RenderMeta` fields the overlay needs (the rest is carried loosely). */
const RenderMetaSchema = z.looseObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  priceLow: finite,
  priceHigh: finite,
  step: finite,
  poc: finite,
  vah: finite,
  val: finite,
  currentPrice: finite.nullable(),
  tiles: z.array(TileSpanSchema).min(1),
})

const ProfileNodesEntrySchema = z.object({
  consensus: ProfileConsensusSchema.nullable(),
  raw: z.array(RawSampleSchema),
  imageHashes: z.array(z.string().regex(/^[0-9a-f]{64}$/)),
  render: RenderMetaSchema,
})
export type PersistedProfileNodesEntry = z.infer<typeof ProfileNodesEntrySchema>

export const PersistedProfileNodesSchema = z.object({
  instrument: z.enum(['NQ', 'ES']),
  modelId: z.string().min(1),
  effort: z.string().nullable(),
  promptRevision: z.string(),
  fewShotSource: z.string(),
  samples: z.number().int().min(1),
  profiles: z.object(
    Object.fromEntries(
      PROFILE_KEYS.map((key) => [key, ProfileNodesEntrySchema.optional()])
    ) as Record<(typeof PROFILE_KEYS)[number], z.ZodOptional<typeof ProfileNodesEntrySchema>>
  ),
  warnings: z.array(z.string()),
})
export type PersistedProfileNodes = z.infer<typeof PersistedProfileNodesSchema>

/** `job_plans.profile_nodes` → the persisted read, or null when absent / malformed. */
export function parsePersistedProfileNodes(value: unknown): PersistedProfileNodes | null {
  if (value == null) return null
  const parsed = PersistedProfileNodesSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** `job_plans.warnings` → string[]; anything else reads as no warnings. */
export function parseJobPlanWarnings(value: unknown): string[] {
  const parsed = z.array(z.string()).safeParse(value)
  return parsed.success ? parsed.data : []
}

// --- the context slice the card renders ---------------------------------------

const ValueZoneSchema = z.object({
  read: z.enum(['below', 'lower-half', 'at-pivot', 'upper-half', 'above']),
  evidence: z.object({
    price: finite,
    valueLow: finite,
    pivot: finite,
    valueHigh: finite,
    fromPivotPts: finite,
    mergeTolerancePts: finite,
  }),
})

const BoxDimensionSchema = z.object({
  boxIndex: z.number().int(),
  read: z.enum([
    'inside-middle',
    'at-lower-edge',
    'at-upper-edge',
    'outside-near',
    'outside-extended',
  ]),
  side: z.enum(['above', 'below', 'inside']),
  evidence: z.object({ low: finite, high: finite, fromLowPts: finite, fromHighPts: finite }),
})

const ZoneEdgeSchema = z.object({ label: z.string(), price: finite })

const EnclosingZoneSchema = z.object({
  kind: z.enum(['jba-box', 'between-bands']),
  lowerEdge: ZoneEdgeSchema,
  upperEdge: ZoneEdgeSchema,
  fromLowerPts: finite,
  fromUpperPts: finite,
  midZone: z.boolean(),
})

const CrossReadSchema = z.object({
  weekly: z.enum(['above', 'inside', 'below']),
  daily: z.enum(['above', 'inside', 'below']),
  jba: z.enum(['inside', 'above-all', 'below-all', 'between', 'none']),
  unanimous: z.boolean(),
  disagreements: z.array(z.string()),
})

const CoverageSchema = z.object({
  asOf: z.string(),
  tradingDay: z.string(),
  sessionStarted: z.boolean(),
  minutesSinceOpen: z.number().nullable(),
  earlyWindow: z.boolean(),
  overnightBars: z.number().int(),
  sessionBars: z.number().int(),
  lastCompletedBarAt: z.string().nullable(),
})

const DataQualityIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['insufficient', 'warning']),
  message: z.string(),
})

const DataQualitySchema = z.object({
  sufficient: z.boolean(),
  issues: z.array(DataQualityIssueSchema),
  exportTimes: z.object({
    daily: z.string(),
    weekly: z.string(),
    mgi: z.string().nullable(),
    bars: z.string().nullable(),
  }),
  maxSkewSeconds: z.number().nullable(),
  tradingDay: z.object({ study: z.string(), bundle: z.string(), match: z.boolean() }),
  boxesProvisional: z.boolean(),
  profileNodes: z.enum(['present', 'partial', 'null']),
})

const ScaleSchema = z.object({
  source: z.enum(['session-sigma', 'fallback-points']),
  sessionSigmaPts: finite.nullable(),
  reachPts: finite,
})

/** The context fields the card renders. Loose at the top so the planner can grow the object freely. */
export const JobContextViewSchema = z.looseObject({
  asOf: z.string(),
  instrument: z.enum(['NQ', 'ES']),
  symbol: z.string(),
  price: z.object({ value: finite, source: z.enum(['mgi', 'job-study']) }),
  scale: ScaleSchema,
  location: z.looseObject({
    vsWeeklyValue: ValueZoneSchema,
    vsDailyValue: ValueZoneSchema,
    vsBoxes: z.array(BoxDimensionSchema),
    enclosingZone: EnclosingZoneSchema.nullable(),
    crossRead: CrossReadSchema,
  }),
  origin: z.looseObject({ coverage: CoverageSchema }),
  dataQuality: DataQualitySchema,
  warnings: z.array(z.string()),
})
export type JobContextView = z.infer<typeof JobContextViewSchema>
