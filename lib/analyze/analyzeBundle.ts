import { Briefing } from '@/knowledge/schema/briefing.schema'
import { DEFAULT_RR_MIN } from '@/lib/engine/riskReward'
import { DEFAULT_MODEL_ID, generateStructured } from '@/lib/llm'
import type { GenerateStructuredResult } from '@/lib/llm'
import { loadDoctrine } from './doctrine'
import { computeEngineFacts, engineZoneBorders } from './engineFacts'
import type { LoadBundleDeps } from './loadBundle'
import { loadLatestBundle } from './loadBundle'
import type { PersistDeps } from './persistBriefing'
import { persistBriefing } from './persistBriefing'
import { buildAnalysisPrompt } from './prompt'
import { enforceCodeOwnedFacts } from './validateBriefing'

/**
 * analyze-task pipeline: load latest bundle → deterministic engine →
 * `generateObject` via OpenRouter (chart images + engine facts + raw MGI,
 * `Briefing` schema, cached doctrine prefix) → enforce code-owned facts →
 * persist briefing + refresh entry_levels.
 *
 * The trigger.dev task is a thin wrapper over {@link runAnalysis}; everything
 * here is driven through injected deps so the pipeline is unit-testable.
 */

/** The `config` singleton fields the analyze-task consumes. */
export interface AnalyzeConfig {
  model_id: string
  rr_min: number
}

export interface AnalyzeDeps extends LoadBundleDeps, PersistDeps {
  /** The `config` row (id=1), or null when unseeded. */
  fetchConfig(): Promise<AnalyzeConfig | null>
  /** LLM call; injectable for tests. Defaults to {@link generateStructured}. */
  generate?: (params: {
    model: string
    system: string
    cacheSystem: boolean
    prompt: string
    images: readonly { base64: string; mediaType?: string }[]
    schema: typeof Briefing
    /** LangSmith trace grouping (feat-030); inert without LANGSMITH_API_KEY. */
    telemetry?: { functionId: string }
  }) => Promise<GenerateStructuredResult<Briefing>>
  /** Doctrine loader; injectable for tests. */
  loadDoctrine?: () => string
  /** Clock; injectable for tests. */
  now?: () => Date
}

export interface AnalyzeResult {
  briefingId: string
  bundleId: string
  /** Model id that actually served the request. */
  model: string
  usage: GenerateStructuredResult<Briefing>['usage']
  /** OpenRouter-reported cost in USD, when usage accounting returns it. */
  cost: number | null
  /** Prompt-cache read tokens (feat-023), when the provider reports them. */
  cachedInputTokens: number | null
  /** Wall-clock latency of the LLM call in milliseconds (feat-030). */
  latencyMs: number
  stale: boolean
  entryLevelCount: number
  warnings: string[]
}

export async function runAnalysis(
  deps: AnalyzeDeps,
  options: { triggerReason: string },
): Promise<AnalyzeResult> {
  const now = deps.now?.() ?? new Date()
  const warnings: string[] = []

  const config = await deps.fetchConfig()
  if (!config) {
    warnings.push('config row missing — using code defaults')
  }
  const modelId = config?.model_id ?? DEFAULT_MODEL_ID
  const rrMin = config?.rr_min ?? DEFAULT_RR_MIN

  const bundle = await loadLatestBundle(deps)
  warnings.push(...bundle.warnings)

  const facts = computeEngineFacts({
    vbpContent: bundle.vbpContent,
    deltaContent: bundle.deltaContent,
    execCsvContent: bundle.execCsvContent,
    mgi: bundle.mgi,
    receivedAt: bundle.row.received_at,
    now,
  })
  warnings.push(...facts.warnings)

  const generate = deps.generate ?? generateStructured
  const result = await generate({
    model: modelId,
    system: (deps.loadDoctrine ?? loadDoctrine)(),
    cacheSystem: true,
    prompt: buildAnalysisPrompt({
      triggerReason: options.triggerReason,
      now: now.toISOString(),
      facts,
      rawMgi: bundle.row.mgi_json,
      charts: bundle.charts,
      rrMin,
    }),
    images: bundle.images,
    schema: Briefing,
    telemetry: { functionId: 'analyze-task' },
  })

  const validated = enforceCodeOwnedFacts(result.object, {
    rrMin,
    engineBorders: engineZoneBorders(facts.terrain),
  })
  warnings.push(...validated.warnings)

  const persisted = await persistBriefing(deps, {
    bundleId: bundle.row.id,
    triggerReason: options.triggerReason,
    model: result.model,
    briefing: validated.briefing,
    riskReward: validated.riskReward,
  })

  return {
    briefingId: persisted.briefingId,
    bundleId: bundle.row.id,
    model: result.model,
    usage: result.usage,
    cost: result.cost,
    cachedInputTokens: result.cachedInputTokens,
    latencyMs: result.latencyMs,
    stale: facts.staleness.isStale,
    entryLevelCount: persisted.entryLevelCount,
    warnings,
  }
}
