import { EvalResult } from '@/knowledge/schema/briefing.schema'
import { loadDoctrine } from '@/lib/analyze/doctrine'
import type { LoadBundleDeps } from '@/lib/analyze/loadBundle'
import { loadLatestBundle } from '@/lib/analyze/loadBundle'
import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { assessStaleness } from '@/lib/engine/staleness'
import { generateStructured } from '@/lib/llm'
import type { GenerateStructuredResult } from '@/lib/llm'
import type { PersistEvalDeps } from './persistEval'
import { persistEvalResult } from './persistEval'
import { buildEvalPrompt } from './prompt'
import type { EntryLevelRow } from './proximity'
import { assessProximity } from './proximity'
import { enforceEvalFacts } from './validateEval'

/**
 * eval-task pipeline ("Check Entry at Current Price"): load the latest bundle
 * (current price = `raw_bundles.current_price`) + the ACTIVE entry levels only
 * (`entry_levels.active = true` — the feat-024 lifecycle contract) →
 * code-owned proximity gate → `generateObject` via OpenRouter with the TRIAGE
 * model (`config.triage_model_id`; chart images + delta telemetry, `EvalResult`
 * schema, cached doctrine prefix) implementing the instructions.md eval logic
 * → enforce code-owned facts → persist one `eval_results` row.
 *
 * The trigger.dev task is a thin wrapper over {@link runEval}; everything here
 * is driven through injected deps so the pipeline is unit-testable.
 */

/**
 * Default triage model id, mirroring the `config.triage_model_id` column
 * default — the cheap/fast tier for entry checks (never hardcode elsewhere).
 */
export const DEFAULT_TRIAGE_MODEL_ID = 'anthropic/claude-haiku-4-5'

/** Thrown when the latest bundle cannot support an eval — retrying cannot help. */
export class EvalInputError extends Error {}

/** The `config` singleton fields the eval-task consumes. */
export interface EvalConfig {
  triage_model_id: string
}

export interface EvalDeps extends LoadBundleDeps, PersistEvalDeps {
  /** The `config` row (id=1), or null when unseeded. */
  fetchConfig(): Promise<EvalConfig | null>
  /** ONLY `entry_levels` rows with `active = true` (feat-024 contract). */
  fetchActiveEntryLevels(): Promise<EntryLevelRow[]>
  /** LLM call; injectable for tests. Defaults to {@link generateStructured}. */
  generate?: (params: {
    model: string
    system: string
    cacheSystem: boolean
    prompt: string
    images: readonly { base64: string; mediaType?: string }[]
    schema: typeof EvalResult
  }) => Promise<GenerateStructuredResult<EvalResult>>
  /** Doctrine loader; injectable for tests. */
  loadDoctrine?: () => string
  /** Clock; injectable for tests. */
  now?: () => Date
}

export interface EvalRunResult {
  evalResultId: string
  bundleId: string
  /** Model id that served the request; null when the LLM call was skipped. */
  model: string | null
  usage: GenerateStructuredResult<EvalResult>['usage'] | null
  /** OpenRouter-reported cost in USD, when usage accounting returns it. */
  cost: number | null
  stale: boolean
  status: EvalResult['status']
  nearEntry: boolean
  warnings: string[]
}

export async function runEval(deps: EvalDeps): Promise<EvalRunResult> {
  const now = deps.now?.() ?? new Date()
  const nowIso = now.toISOString()
  const warnings: string[] = []

  const config = await deps.fetchConfig()
  if (!config) {
    warnings.push('config row missing — using code defaults')
  }
  const modelId = config?.triage_model_id ?? DEFAULT_TRIAGE_MODEL_ID

  const bundle = await loadLatestBundle(deps)
  warnings.push(...bundle.warnings)

  const currentPrice = bundle.row.current_price
  if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) {
    throw new EvalInputError(`bundle ${bundle.row.id} has no current_price`)
  }

  const staleness = assessStaleness({ receivedAt: bundle.row.received_at, now })
  if (staleness.isStale) {
    warnings.push(staleness.warning ?? 'bundle is stale')
  }
  const deltaTelemetry = computeDeltaTelemetry(parseExecBars(bundle.execCsvContent))

  const levels = await deps.fetchActiveEntryLevels()
  const proximity = assessProximity(levels, currentPrice)

  // No active levels at all (no briefing yet, or all deactivated): there is
  // nothing to evaluate — persist a code-owned NO_ENTRY_NEAR verdict without
  // spending an LLM call.
  if (levels.length === 0) {
    warnings.push('no active entry_levels exist — skipped the LLM call')
    const result: EvalResult = {
      meta: { createdAt: nowIso, currentPrice, nearEntry: false },
      status: 'NO_ENTRY_NEAR',
      reason:
        'No entry near. There are no active entry levels — run a briefing first to map entries.',
    }
    const { evalResultId } = await persistEvalResult(deps, {
      bundleId: bundle.row.id,
      modelId: null,
      result,
      rawModelResult: result,
      evaluatedLevelId: null,
    })
    return {
      evalResultId,
      bundleId: bundle.row.id,
      model: null,
      usage: null,
      cost: null,
      stale: staleness.isStale,
      status: result.status,
      nearEntry: false,
      warnings,
    }
  }

  const generate = deps.generate ?? generateStructured
  const generated = await generate({
    model: modelId,
    system: (deps.loadDoctrine ?? loadDoctrine)(),
    cacheSystem: true,
    prompt: buildEvalPrompt({
      now: nowIso,
      currentPrice,
      staleness,
      deltaTelemetry,
      levels,
      proximity,
      charts: bundle.charts,
    }),
    images: bundle.images,
    schema: EvalResult,
  })

  const validated = enforceEvalFacts(generated.object, {
    now: nowIso,
    currentPrice,
    proximity,
    levels,
  })
  warnings.push(...validated.warnings)

  const { evalResultId } = await persistEvalResult(deps, {
    bundleId: bundle.row.id,
    modelId: generated.model,
    result: validated.result,
    rawModelResult: generated.object,
    evaluatedLevelId: validated.evaluatedLevelId,
  })

  return {
    evalResultId,
    bundleId: bundle.row.id,
    model: generated.model,
    usage: generated.usage,
    cost: generated.cost,
    stale: staleness.isStale,
    status: validated.result.status,
    nearEntry: proximity.nearEntry,
    warnings,
  }
}
