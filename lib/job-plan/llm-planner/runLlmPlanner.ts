import { generateStructured } from '@/lib/llm'
import type { ReasoningEffort } from '@/lib/llm/reasoning'
import { insufficiencyReasons } from '../buildPlan'
import type { JobContext } from '../contextTypes'
import { llmContextPayload } from './contextPayload'
import { buildLlmPlannerPrompt, LLM_PLANNER_REVISION } from './prompt'
import { LlmPlanJudgmentSchema, type LlmPlanJudgment } from './schema'
import { validateJudgment, type JudgmentViolation } from './validate'

/**
 * One LLM shadow-planner call (feat-144): serialize the context, ask for the
 * judgment, enforce the hard gates with ONE retry (the eval-contract pattern —
 * the violations are spelled out and the model corrects itself), and record
 * whatever violations survive rather than throwing: a shadow run reports,
 * it never aborts the experiment.
 *
 * The model id comes from the caller (the shadow script reads `config.model_id`)
 * — never hardcoded here.
 */

export type LlmPlannerGenerate = typeof generateStructured

export type RunLlmPlannerInput = {
  readonly context: JobContext
  /** OpenRouter model id (`config.model_id` via the caller). */
  readonly model: string
  readonly effort?: ReasoningEffort | null
  /** Injectable for tests. */
  readonly generate?: LlmPlannerGenerate
}

export type LlmPlannerResult = {
  readonly judgment: LlmPlanJudgment
  /** Violations remaining after the final attempt — empty on a clean run. */
  readonly violations: readonly JudgmentViolation[]
  /** 1 = clean first pass, 2 = the retry ran. */
  readonly attempts: number
  readonly promptRevision: string
  /** Model id the provider reported serving the (last) request. */
  readonly model: string
  /** Total across attempts, null when the provider reported none. */
  readonly costUsd: number | null
  readonly latencyMs: number
}

function retryPrompt(base: string, judgment: LlmPlanJudgment, violations: readonly JudgmentViolation[]): string {
  return [
    base,
    'YOUR PREVIOUS ANSWER violated the contract:',
    violations.map((v) => `- ${v.code}: ${v.message}`).join('\n'),
    `Previous answer:\n${JSON.stringify(judgment)}`,
    'Fix every violation and return the corrected JSON. Keep everything that was not flagged.',
  ].join('\n\n')
}

export async function runLlmPlanner(input: RunLlmPlannerInput): Promise<LlmPlannerResult> {
  const { context, model, effort = null, generate = generateStructured } = input
  // R13 fails closed BEFORE any model spend — same sufficiency bar as buildPlan.
  const insufficient = insufficiencyReasons(context)
  if (insufficient.length > 0) {
    throw new Error(`llm-planner: insufficient context, no model call — ${insufficient.join('; ')}`)
  }
  const payload = JSON.stringify(llmContextPayload(context), null, 1)
  const basePrompt = buildLlmPlannerPrompt(payload)

  const first = await generate({
    model,
    effort,
    schema: LlmPlanJudgmentSchema,
    prompt: basePrompt,
    requireParameters: true,
  })
  let judgment = first.object
  let violations = validateJudgment(judgment, context)
  let attempts = 1
  let cost = first.cost
  let latencyMs = first.latencyMs
  let servedModel = first.model

  if (violations.length > 0) {
    const second = await generate({
      model,
      effort,
      schema: LlmPlanJudgmentSchema,
      prompt: retryPrompt(basePrompt, judgment, violations),
      requireParameters: true,
    })
    judgment = second.object
    violations = validateJudgment(judgment, context)
    attempts = 2
    cost = cost === null && second.cost === null ? null : (cost ?? 0) + (second.cost ?? 0)
    latencyMs += second.latencyMs
    servedModel = second.model
  }

  return {
    judgment,
    violations,
    attempts,
    promptRevision: LLM_PLANNER_REVISION,
    model: servedModel,
    costUsd: cost,
    latencyMs,
  }
}
