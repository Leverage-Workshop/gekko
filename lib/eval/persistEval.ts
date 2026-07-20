import type { EvalCheck, EvalResult } from '@/knowledge/schema/briefing.schema'

/**
 * Persistence step of the eval-task: one `eval_results` row per check.
 * Columns hold the code-enforced verdict; `raw_model_json` keeps the model's
 * unmodified output so drift/coercions stay auditable. Side effects injected.
 */

/** Insert shape for `public.eval_results`. */
export interface EvalResultInsert {
  bundle_id: string
  /** Model that actually served the request; null when no LLM call was made. */
  model_id: string | null
  near_entry: boolean
  status: EvalResult['status']
  evaluated_level_id: string | null
  direction: string | null
  trigger: string | null
  stop: number | null
  targets: number[] | null
  reason: string
  checks: EvalCheck[] | null
  next_signal: string | null
  caution: string | null
  /** The model's full, unmodified output (the enforced copy lives in columns). */
  raw_model_json: EvalResult
  current_price: number
  /**
   * Runtime warnings captured at persist time (enforcement coercions,
   * staleness, degraded inputs); null when the run produced none. This is
   * what lets the dashboard explain a code-demoted WAIT whose columns still
   * carry the model's all-pass checks.
   */
  warnings: string[] | null
}

export interface PersistEvalDeps {
  insertEvalResult(row: EvalResultInsert): Promise<{ id: string }>
}

export interface PersistEvalInput {
  bundleId: string
  modelId: string | null
  /** Code-enforced result (see enforceEvalFacts). */
  result: EvalResult
  /** The model's raw output, pre-enforcement. */
  rawModelResult: EvalResult
  evaluatedLevelId: string | null
  /** All warnings accumulated by the run so far (empty → persisted as null). */
  warnings?: readonly string[]
}

export function buildEvalResultRow(input: PersistEvalInput): EvalResultInsert {
  const { result } = input
  return {
    bundle_id: input.bundleId,
    model_id: input.modelId,
    near_entry: result.meta.nearEntry,
    status: result.status,
    evaluated_level_id: input.evaluatedLevelId,
    direction: result.direction ?? null,
    trigger: result.trigger ?? null,
    stop: result.stop ?? null,
    targets: result.targets ?? null,
    reason: result.reason,
    checks: result.checks ?? null,
    next_signal: result.nextSignal ?? null,
    caution: result.caution ?? null,
    raw_model_json: input.rawModelResult,
    current_price: result.meta.currentPrice,
    warnings:
      input.warnings && input.warnings.length > 0 ? [...input.warnings] : null,
  }
}

export async function persistEvalResult(
  deps: PersistEvalDeps,
  input: PersistEvalInput,
): Promise<{ evalResultId: string }> {
  const { id } = await deps.insertEvalResult(buildEvalResultRow(input))
  return { evalResultId: id }
}
