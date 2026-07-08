import type { EvalResult } from '@/knowledge/schema/briefing.schema'

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
  /** The model's full, unmodified output (the enforced copy lives in columns). */
  raw_model_json: EvalResult
  current_price: number
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
    raw_model_json: input.rawModelResult,
    current_price: result.meta.currentPrice,
  }
}

export async function persistEvalResult(
  deps: PersistEvalDeps,
  input: PersistEvalInput,
): Promise<{ evalResultId: string }> {
  const { id } = await deps.insertEvalResult(buildEvalResultRow(input))
  return { evalResultId: id }
}
