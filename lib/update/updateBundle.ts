import { Briefing, BriefingUpdate } from '@/knowledge/schema/briefing.schema'
import type { AnalyzeConfig } from '@/lib/analyze'
import {
  computeEngineFacts,
  engineAnchorPrices,
  engineZoneBorders,
  enforceCodeOwnedFacts,
  loadDoctrine,
  loadLatestBundle,
  persistBriefing,
} from '@/lib/analyze'
import type { DoctrineTask, LoadBundleDeps, PersistDeps } from '@/lib/analyze'
import { DEFAULT_RR_MIN } from '@/lib/engine/riskReward'
import { DEFAULT_MODEL_ID, generateStructured } from '@/lib/llm'
import type { GenerateStructuredResult } from '@/lib/llm'
import { composeUpdateBriefing } from './composeBriefing'
import { buildUpdatePrompt } from './prompt'

/**
 * update-task pipeline (feat-038): the Gem's "Update" prompt — load the
 * latest bundle AND the latest briefing → deterministic engine →
 * `generateObject` with the smaller `BriefingUpdate` schema (previous
 * briefing embedded as context) → compose a full Briefing (overview/terrain
 * inherited from the parent) → enforce code-owned facts → persist as a new
 * `briefings` row (kind='update') + refresh entry_levels.
 *
 * The trigger.dev task is a thin wrapper over {@link runUpdate}; everything
 * here is driven through injected deps so the pipeline is unit-testable.
 */

/** Thrown when no usable previous briefing exists — retrying cannot help. */
export class UpdateInputError extends Error {}

/** The `briefings` columns the update-task reads back as parent context. */
export interface ParentBriefingRow {
  id: string
  created_at: string
  kind: string | null
  raw_model_json: unknown
}

// Parallel to AnalyzeDeps rather than extending it: AnalyzeDeps.generate is
// hard-typed to `schema: typeof Briefing`, and the update call passes the
// smaller BriefingUpdate schema.
export interface UpdateDeps extends LoadBundleDeps, PersistDeps {
  /** The `config` row (id=1), or null when unseeded. */
  fetchConfig(): Promise<AnalyzeConfig | null>
  /** Latest `briefings` row of ANY kind — chained updates inherit transitively. */
  fetchLatestBriefing(): Promise<ParentBriefingRow | null>
  /** LLM call; injectable for tests. Defaults to {@link generateStructured}. */
  generate?: (params: {
    model: string
    system: string
    cacheSystem: boolean
    prompt: string
    images: readonly { base64: string; mediaType?: string }[]
    schema: typeof BriefingUpdate
    telemetry?: { functionId: string }
  }) => Promise<GenerateStructuredResult<BriefingUpdate>>
  /** Doctrine loader; injectable for tests. */
  loadDoctrine?: (task: DoctrineTask) => string
  /** Clock; injectable for tests. */
  now?: () => Date
}

export interface UpdateResult {
  briefingId: string
  parentBriefingId: string
  bundleId: string
  /** Model id that actually served the request. */
  model: string
  usage: GenerateStructuredResult<BriefingUpdate>['usage']
  cost: number | null
  cachedInputTokens: number | null
  latencyMs: number
  highConviction: boolean
  stale: boolean
  entryLevelCount: number
  warnings: string[]
}

export async function runUpdate(
  deps: UpdateDeps,
  options: { triggerReason: string },
): Promise<UpdateResult> {
  const now = deps.now?.() ?? new Date()
  const warnings: string[] = []

  const config = await deps.fetchConfig()
  if (!config) {
    warnings.push('config row missing — using code defaults')
  }
  // Same high-conviction routing as the analyze-task (feat-031) — an update
  // is a full-fidelity strategy regeneration, so it rides the same tier.
  let highConviction = config?.high_conviction_enabled === true
  if (highConviction && !config?.high_conviction_model_id) {
    warnings.push(
      'high_conviction_enabled is set but high_conviction_model_id is empty — using model_id',
    )
    highConviction = false
  }
  const modelId =
    highConviction && config?.high_conviction_model_id
      ? config.high_conviction_model_id
      : (config?.model_id ?? DEFAULT_MODEL_ID)
  const rrMin = config?.rr_min ?? DEFAULT_RR_MIN

  const parentRow = await deps.fetchLatestBriefing()
  if (!parentRow) {
    throw new UpdateInputError('no previous briefing exists — run a full briefing first')
  }
  const parentParse = Briefing.safeParse(parentRow.raw_model_json)
  if (!parentParse.success) {
    throw new UpdateInputError(
      `previous briefing ${parentRow.id} no longer parses as a Briefing — run a full briefing first`,
    )
  }
  const parent = parentParse.data
  const ageMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(parentRow.created_at).getTime()) / 60_000),
  )

  const bundle = await loadLatestBundle(deps)
  warnings.push(...bundle.warnings)

  const facts = computeEngineFacts({
    rotationVbpContent: bundle.rotationVbpContent,
    balanceAreaVbpContent: bundle.balanceAreaVbpContent,
    halfRotationDeltaContent: bundle.halfRotationDeltaContent,
    fullRotationDeltaContent: bundle.fullRotationDeltaContent,
    execCsvContent: bundle.execCsvContent,
    mgi: bundle.mgi,
    receivedAt: bundle.row.received_at,
    now,
  })
  warnings.push(...facts.warnings)

  const generate = deps.generate ?? generateStructured
  const result = await generate({
    model: modelId,
    system: (deps.loadDoctrine ?? loadDoctrine)('update'),
    cacheSystem: true,
    prompt: buildUpdatePrompt({
      triggerReason: options.triggerReason,
      now: now.toISOString(),
      facts,
      rawMgi: bundle.row.mgi_json,
      charts: bundle.charts,
      rrMin,
      parent: {
        briefing: parent,
        createdAt: parentRow.created_at,
        kind: parentRow.kind ?? 'morning',
        ageMinutes,
      },
    }),
    images: bundle.images,
    schema: BriefingUpdate,
    telemetry: { functionId: 'update-task' },
  })

  const composed = composeUpdateBriefing(parent, result.object)
  // No enforceEntryStandoff here: an update revises a standing plan, and price
  // approaching its planned entry is the success path, not an at-price defect.
  const validated = enforceCodeOwnedFacts(composed, {
    rrMin,
    engineBorders: engineZoneBorders(facts.terrain),
    anchorPrices: engineAnchorPrices(facts.terrain),
    meta: {
      createdAt: now.toISOString(),
      currentPrice: facts.currentPrice,
      triggerReason: options.triggerReason,
      ripStatus: facts.ripStatus?.condition ?? null,
    },
  })
  warnings.push(...validated.warnings)

  const persisted = await persistBriefing(deps, {
    bundleId: bundle.row.id,
    triggerReason: options.triggerReason,
    model: result.model,
    briefing: validated.briefing,
    riskReward: validated.riskReward,
    update: {
      kind: 'update',
      parentBriefingId: parentRow.id,
      tacticalRead: result.object.tacticalRead,
    },
  })

  return {
    briefingId: persisted.briefingId,
    parentBriefingId: parentRow.id,
    bundleId: bundle.row.id,
    model: result.model,
    usage: result.usage,
    cost: result.cost,
    cachedInputTokens: result.cachedInputTokens,
    latencyMs: result.latencyMs,
    highConviction,
    stale: facts.staleness.isStale,
    entryLevelCount: persisted.entryLevelCount,
    warnings,
  }
}
