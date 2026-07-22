import { EvalResult } from '@/knowledge/schema/briefing.schema'
import { loadDoctrine } from '@/lib/analyze/doctrine'
import type { DoctrineTask } from '@/lib/analyze/doctrine'
import type { LoadBundleDeps } from '@/lib/analyze/loadBundle'
import { loadLatestBundle } from '@/lib/analyze/loadBundle'
import type { AbsorptionScanResult, DeltaProfileRow } from '@/lib/engine/absorption'
import { scanAbsorption } from '@/lib/engine/absorption'
import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { parseDeltaProfile } from '@/lib/engine/parseProfile'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { assessStaleness } from '@/lib/engine/staleness'
import { generateStructured } from '@/lib/llm'
import type { GenerateStructuredResult } from '@/lib/llm'
import type { PersistEvalDeps } from './persistEval'
import { persistEvalResult } from './persistEval'
import { buildEvalPrompt } from './prompt'
import type { EntryLevelRow } from './proximity'
import {
  DEFAULT_PROXIMITY_WINDOW_SECONDS,
  assessProximity,
  filterRecentBars,
} from './proximity'
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
export const DEFAULT_TRIAGE_MODEL_ID = 'openai/gpt-5.6-luna'

/** Thrown when the latest bundle cannot support an eval — retrying cannot help. */
export class EvalInputError extends Error {}

/** Parse one delta export defensively: malformed content degrades to no rows + warning. */
function parseDeltaRows(
  content: string | null,
  what: string,
  warnings: string[],
): DeltaProfileRow[] {
  if (content === null) return []
  try {
    return parseDeltaProfile(content).rows
  } catch (error) {
    warnings.push(
      `failed to parse the ${what} delta export: ${error instanceof Error ? error.message : String(error)}`,
    )
    return []
  }
}

/**
 * Code-owned absorption scan over whichever delta exports the bundle carries.
 * Null (rather than an empty scan) when neither export is usable, so the
 * prompt can tell "scanned, nothing found" apart from "nothing to scan".
 */
function scanEvalAbsorption(
  halfRotationContent: string | null,
  fullRotationContent: string | null,
  warnings: string[],
): AbsorptionScanResult | null {
  const halfRotation = parseDeltaRows(halfRotationContent, 'half-rotation', warnings)
  const fullRotation = parseDeltaRows(fullRotationContent, 'full-rotation', warnings)
  if (halfRotation.length === 0 && fullRotation.length === 0) {
    return null
  }
  return scanAbsorption({ halfRotation, fullRotation })
}

/** The `config` singleton fields the eval-task consumes. */
export interface EvalConfig {
  triage_model_id: string
  /** Recency window (seconds) for the proximity bar-range gate; null → code default. */
  proximity_window_seconds?: number | null
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
    /** LangSmith trace grouping (feat-030); inert without LANGSMITH_API_KEY. */
    telemetry?: { functionId: string }
  }) => Promise<GenerateStructuredResult<EvalResult>>
  /** Doctrine loader; injectable for tests. */
  loadDoctrine?: (task: DoctrineTask) => string
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
  /** Prompt-cache read tokens (feat-023); null when skipped/not reported. */
  cachedInputTokens: number | null
  /** LLM-call latency in ms (feat-030); null when the LLM call was skipped. */
  latencyMs: number | null
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

  // exec-plus-delta: the exec CSV is required; the two execution delta
  // exports feed the code-owned absorption scan but are best-effort — a
  // bundle missing them must not block an entry check.
  const bundle = await loadLatestBundle(deps, { requireTexts: 'exec-plus-delta' })
  warnings.push(...bundle.warnings)

  const currentPrice = bundle.row.current_price
  if (typeof currentPrice !== 'number' || !Number.isFinite(currentPrice)) {
    throw new EvalInputError(`bundle ${bundle.row.id} has no current_price`)
  }

  const staleness = assessStaleness({ receivedAt: bundle.row.received_at, now })
  if (staleness.isStale) {
    warnings.push(staleness.warning ?? 'bundle is stale')
  }
  const execBars = parseExecBars(bundle.execCsvContent)
  const deltaTelemetry = computeDeltaTelemetry(execBars)
  const recentBars = execBars.slice(-deltaTelemetry.recentWindow)
  const absorption = scanEvalAbsorption(
    bundle.halfRotationDeltaContent,
    bundle.fullRotationDeltaContent,
    warnings,
  )

  const configWindow = config?.proximity_window_seconds
  const windowSeconds =
    typeof configWindow === 'number' && Number.isFinite(configWindow) && configWindow > 0
      ? configWindow
      : DEFAULT_PROXIMITY_WINDOW_SECONDS

  const levels = await deps.fetchActiveEntryLevels()
  const proximity = assessProximity(levels, currentPrice, {
    recentBars: filterRecentBars(execBars, windowSeconds * 1000),
  })
  if (
    proximity.nearEntry &&
    proximity.nearest &&
    proximity.nearest.distancePoints > proximity.thresholdPoints
  ) {
    warnings.push(
      `proximity gate passed via the recent bar window (${windowSeconds}s): price traded within ` +
        `${proximity.nearest.effectiveDistancePoints} points of the nearest level, but the snapshot ` +
        `price is ${proximity.nearest.distancePoints} points away`,
    )
  }

  // No active levels at all (no briefing yet, or all deactivated): there is
  // nothing to evaluate — persist a code-owned NO_ENTRY_NEAR verdict without
  // spending an LLM call.
  if (levels.length === 0) {
    warnings.push('no active entry_levels exist — skipped the LLM call')
    const result: EvalResult = {
      meta: { createdAt: nowIso, currentPrice, nearEntry: false, zone: null },
      status: 'NO_ENTRY_NEAR',
      evaluatedLevel: null,
      direction: null,
      trigger: null,
      stop: null,
      targets: null,
      checks: null,
      nextSignal: null,
      caution: null,
      reason:
        'No entry near. There are no active entry levels — run a briefing first to map entries.',
    }
    const { evalResultId } = await persistEvalResult(deps, {
      bundleId: bundle.row.id,
      modelId: null,
      result,
      rawModelResult: result,
      evaluatedLevelId: null,
      warnings,
    })
    return {
      evalResultId,
      bundleId: bundle.row.id,
      model: null,
      usage: null,
      cost: null,
      cachedInputTokens: null,
      latencyMs: null,
      stale: staleness.isStale,
      status: result.status,
      nearEntry: false,
      warnings,
    }
  }

  const generate = deps.generate ?? generateStructured
  const generated = await generate({
    model: modelId,
    system: (deps.loadDoctrine ?? loadDoctrine)('eval'),
    cacheSystem: true,
    prompt: buildEvalPrompt({
      now: nowIso,
      currentPrice,
      staleness,
      deltaTelemetry,
      levels,
      proximity,
      charts: bundle.charts,
      absorption,
      recentBars,
    }),
    images: bundle.images,
    schema: EvalResult,
    telemetry: { functionId: 'eval-task' },
  })

  const validated = enforceEvalFacts(generated.object, {
    now: nowIso,
    currentPrice,
    proximity,
    levels,
    deltaTelemetry,
  })
  warnings.push(...validated.warnings)

  const { evalResultId } = await persistEvalResult(deps, {
    bundleId: bundle.row.id,
    modelId: generated.model,
    result: validated.result,
    rawModelResult: generated.object,
    evaluatedLevelId: validated.evaluatedLevelId,
    warnings,
  })

  return {
    evalResultId,
    bundleId: bundle.row.id,
    model: generated.model,
    usage: generated.usage,
    cost: generated.cost,
    cachedInputTokens: generated.cachedInputTokens,
    latencyMs: generated.latencyMs,
    stale: staleness.isStale,
    status: validated.result.status,
    nearEntry: proximity.nearEntry,
    warnings,
  }
}
