import type { JobPlan, PlanStatus } from '@/knowledge/schema/job-plan.schema'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import { parseExecBars, type ExecBar } from '@/lib/engine/parseExecBars'
import { parseHtfBars } from '@/lib/engine/parseHtfBars'
import { DEFAULT_PROFILE_VISION_SAMPLES } from '@/lib/config/fetchConfig'
import { computeInputFingerprint, sourceHashesOf } from './fingerprint'
import { JobPlanAbortError } from './jobPlanErrors'
import { loadJobBundle, type LoadJobBundleDeps, type LoadedJobBundle, type BundleWaitOutcome } from './loadJobBundle'
import { assembleLlmPlan, llmPlannerRevision } from './llm-planner/assemblePlan'
import { LlmPlanContractError, runLlmPlanner, type LlmPlannerGenerate } from './llm-planner/runLlmPlanner'
import { parseJobStudy } from './parseJobStudy'
import type { JobPlannerKind } from './plannerMode'
import { instrumentFromSymbol, type Instrument } from './profile-vision/instrument'
import type { ProfileKey, ProfileNodes } from './profile-vision/types'
import { PLANNER_REVISION } from './rules'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { chartAsOf } from './dataQuality'
import { parseBars, parseMgiJson, runPlanner } from './runPlanner'
import {
  readProfileNodes,
  type JobPlanConfig,
  type JobPlanVisionGenerate,
  type VisionReadResult,
  type VisionSummary,
} from './visionRead'

/**
 * The job-plan task's pipeline (feat-128, docs/job-planning-task-plan.md
 * step 6): bind the fresh bundle → download the exact bytes → pre-flight
 * parse (fail closed BEFORE spending on vision) → vision read (R14) →
 * fingerprint → `runPlanner` → persist ONE `job_plans` row.
 *
 * Everything with a side effect is injected ({@link JobPlanDeps}) so the
 * shell is unit-testable with fakes; `trigger/jobPlanTask.ts` is a thin
 * wrapper. HARD LIMITS: the only LLM uses are the vision read and — when the
 * task selects `planner: 'llm'` (feat-145, `plannerMode.ts`) — the ONE
 * judgment call; nothing here touches `briefings` / `entry_levels`; no push.
 *
 * LLM planner path (feat-145): after the deterministic pipeline produces a
 * `ready` plan, the judgment core is re-decided by the model over the SAME
 * `JobContext` and assembled by `assembleLlmPlan`; the assembled plan is what
 * gets persisted. `insufficient` fails closed BEFORE any judgment spend, a
 * surviving contract violation throws {@link LlmPlanContractError}
 * (retryable — a fresh attempt gets a fresh call), and an unseeded config
 * (no model id) falls back to the deterministic plan with a warning.
 *
 * WRITE CONTRACT: the row is written only after computation completes; the
 * row's identity is the trigger.dev run id (retries upsert their own row); an
 * `insufficient` result never overwrites a persisted `ready` one
 * (`outcome: 'kept-ready'`).
 */

export type { JobPlanConfig, VisionSummary } from './visionRead'

/** Insert shape for `public.job_plans` (upserted on `run_id`). */
export type JobPlanInsert = {
  readonly bundle_id: string
  readonly trading_day: string
  readonly trigger_reason: string
  readonly status: PlanStatus
  readonly planner_revision: string
  readonly input_fingerprint: string
  readonly run_id: string
  readonly plan: JobPlan
  readonly warnings: readonly string[]
  readonly profile_nodes: ProfileNodes | null
}

export interface JobPlanDeps extends LoadJobBundleDeps {
  /** The `config` row's profile-vision columns, or null when unseeded (read OFF). */
  fetchConfig: () => Promise<JobPlanConfig | null>
  /** Store one PNG under `<sha256>.png` in `job-plan-images`. */
  uploadImage: (path: string, png: Uint8Array) => Promise<void>
  /** The row a prior attempt of this run persisted, if any. */
  fetchJobPlanByRunId: (runId: string) => Promise<{ id: string; status: PlanStatus } | null>
  /**
   * Upsert on `run_id`; returns the row AS PERSISTED. The database's
   * `job_plans_keep_ready` trigger turns a ready → insufficient demotion into a
   * no-op, so the returned status may differ from the one written.
   */
  insertJobPlan: (row: JobPlanInsert) => Promise<{ id: string; status: PlanStatus }>
  /** The vision model call. */
  generate: JobPlanVisionGenerate
  /** The LLM planner's judgment call (feat-145) — used only when the run selects `planner: 'llm'`. */
  generateJudgment: LlmPlannerGenerate
  /** Test overrides for the render → PNG step and the few-shot set. */
  rasterize?: (svg: string) => Uint8Array
}

export type RunJobPlanOptions = {
  /** The trigger.dev run id — stable across attempt retries. */
  readonly runId: string
  readonly triggerReason: string
  /** The pending `bundle_requests` row the dashboard inserted; absent on test runs. */
  readonly bundleRequestId?: string
  /**
   * Absolute deadline (epoch ms) for the vision read, from the TASK's own
   * budget. This module is clock-free by contract, so the task computes it.
   */
  readonly visionDeadlineAt?: number
  /**
   * Which planner composes the persisted plan (feat-145). Defaults to
   * 'deterministic'; the production task passes `JOB_PLANNER` from
   * `plannerMode.ts`.
   */
  readonly planner?: JobPlannerKind
}

/** Judgment-call spend and provenance, for run metadata (like `vision`). */
export type LlmPlannerSummary = {
  readonly modelId: string
  readonly promptRevision: string
  /** 1 = clean first pass, 2 = the contract retry ran. */
  readonly attempts: number
  readonly costUsd: number | null
  readonly latencyMs: number
}

export type JobPlanRunResult = {
  readonly jobPlanId: string
  readonly outcome: 'persisted' | 'kept-ready'
  readonly status: PlanStatus
  readonly bundleId: string
  readonly bundleWait: BundleWaitOutcome
  readonly tradingDay: string
  readonly plannerRevision: string
  readonly inputFingerprint: string
  readonly warnings: readonly string[]
  readonly vision: VisionSummary | null
  /** Set when the run selected `planner: 'llm'` and the judgment call ran. */
  readonly llm: LlmPlannerSummary | null
  readonly plan: JobPlan
}

export const CONFIG_MISSING_WARNING =
  'config row missing — profile vision read OFF (no model id to read with)'

export const LLM_PLANNER_OFF_WARNING =
  'llm_planner_off: no config.model_id to judge with — the DETERMINISTIC plan was persisted instead (feat-145 fallback)'

const VISION_OFF_CONFIG: JobPlanConfig = {
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: DEFAULT_PROFILE_VISION_SAMPLES,
  model_id: null,
  model_effort: null,
}

type Preflight = {
  readonly instrument: Instrument
  readonly currentPrice: number | null
  readonly profiles: Readonly<Record<ProfileKey, VbpProfile>>
  readonly mgi: MgiStaticLevels
  readonly execBars: readonly ExecBar[]
}

function parseProfile(text: string, what: string): VbpProfile {
  try {
    // Zero-fill any rows the exporter omitted (harmless on hole-free exports).
    return parseVbpProfile(text, { fillMissingRows: true })
  } catch (error) {
    throw new JobPlanAbortError(
      'profile_unsupported',
      `${what} export does not parse: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Parse everything the planner will parse again, BEFORE the vision read: a
 * broken export aborts here without spending a model call. Throws the
 * planner's own errors (`JobStudyParseError` / `PlannerInputError`) or
 * `profile_unsupported` — all non-retryable. The parsed MGI + exec bars ride
 * along so the run's `asOf` can come from the chart clock ({@link chartAsOf}).
 */
export function preflightParse(texts: LoadedJobBundle['texts']): Preflight {
  const study = parseJobStudy({ daily: texts.jobStudyDaily, weekly: texts.jobStudyWeekly })
  const mgi = parseMgiJson(texts.mgi)
  const execBars = parseBars(texts.execBars, parseExecBars, 'exec_bars_invalid')
  parseBars(texts.htfBars, parseHtfBars, 'htf_bars_invalid')
  const symbol = mgi.symbol?.trim() ?? ''
  const fromMgi = symbol.length > 0 ? instrumentFromSymbol(symbol) : null
  return {
    instrument: fromMgi ?? study.instrument,
    currentPrice: mgi.current?.price ?? null,
    profiles: {
      balance: parseProfile(texts.balanceAreaProfile, 'balance-area volume profile'),
      rotation: parseProfile(texts.rotationProfile, '400-pt rotation volume profile'),
    },
    mgi,
    execBars,
  }
}

function buildRow(
  bundle: LoadedJobBundle,
  plan: JobPlan,
  options: RunJobPlanOptions,
  warnings: readonly string[],
  profileNodes: ProfileNodes | null,
  inputFingerprint: string,
): JobPlanInsert {
  return {
    bundle_id: bundle.row.id,
    trading_day: plan.meta.tradingDay,
    trigger_reason: options.triggerReason,
    status: plan.status,
    // What actually produced the plan — in the llm-off fallback corner the
    // persisted plan is deterministic and the row says so.
    planner_revision: plan.meta.plannerRevision,
    input_fingerprint: inputFingerprint,
    run_id: options.runId,
    plan,
    warnings,
    profile_nodes: profileNodes,
  }
}

/**
 * The write contract: upsert on run_id, except an insufficient result never
 * replaces a persisted ready one. The pre-read skips the write in the common
 * sequential-retry case; the database trigger (`job_plans_keep_ready`,
 * 20260826130000) is the ATOMIC guard for overlapping attempts, and the
 * outcome is read back from what the row holds after the write.
 */
async function persistJobPlan(
  deps: JobPlanDeps,
  row: JobPlanInsert,
): Promise<{ id: string; outcome: JobPlanRunResult['outcome'] }> {
  const existing = await deps.fetchJobPlanByRunId(row.run_id)
  if (existing !== null && existing.status === 'ready' && row.status === 'insufficient') {
    return { id: existing.id, outcome: 'kept-ready' }
  }
  const persisted = await deps.insertJobPlan(row)
  return { id: persisted.id, outcome: persisted.status === row.status ? 'persisted' : 'kept-ready' }
}

const dedupe = (items: readonly string[]): string[] => [...new Set(items)]

async function visionRead(
  deps: JobPlanDeps,
  config: JobPlanConfig,
  preflight: Preflight,
  visionDeadlineAt: number | undefined,
): Promise<VisionReadResult> {
  return readProfileNodes({
    ...(visionDeadlineAt === undefined ? {} : { deadlineAt: visionDeadlineAt }),
    config,
    instrument: preflight.instrument,
    currentPrice: preflight.currentPrice,
    profiles: preflight.profiles,
    generate: deps.generate,
    uploadImage: deps.uploadImage,
    ...(deps.rasterize ? { rasterize: deps.rasterize } : {}),
  })
}

export async function runJobPlan(deps: JobPlanDeps, options: RunJobPlanOptions): Promise<JobPlanRunResult> {
  const planner: JobPlannerKind = options.planner ?? 'deterministic'
  const configRow = await deps.fetchConfig()
  const config = configRow ?? VISION_OFF_CONFIG
  const configWarnings = configRow === null ? [CONFIG_MISSING_WARNING] : []

  const bundle = await loadJobBundle(deps, options.bundleRequestId)
  const preflight = preflightParse(bundle.texts)
  const vision = await visionRead(deps, config, preflight, options.visionDeadlineAt)

  const plannerRevision = planner === 'llm' ? llmPlannerRevision() : PLANNER_REVISION
  const visionModelId = vision.profileNodes?.modelId ?? null
  const visionPromptRevision = vision.profileNodes?.promptRevision ?? null
  const inputFingerprint = computeInputFingerprint({
    sources: bundle.sources,
    plannerRevision,
    imageHashes: vision.imageHashes,
    visionPromptRevision,
    visionModelId,
  })

  // The chart clock (last exec bar / MGI time), never received_at: a replayed
  // bundle must plan on the replay day, not the machine's.
  const asOf = chartAsOf(preflight.mgi, preflight.execBars) ?? bundle.asOf
  const meta = {
    bundleId: bundle.row.id,
    inputFingerprint,
    sourceHashes: sourceHashesOf(bundle.sources),
    visionPromptRevision,
    visionModelId,
  }
  const { plan: deterministicPlan, warnings: planWarnings } = runPlanner({
    files: bundle.texts,
    profileNodes: vision.profileNodes,
    asOf,
    meta,
  })

  // The LLM judgment core (feat-145): same context, model-chosen frame /
  // plays / order / lean, code-assembled plays. `insufficient` never spends;
  // surviving contract violations throw (retryable).
  let plan = deterministicPlan
  let llm: LlmPlannerSummary | null = null
  const llmWarnings: string[] = []
  if (planner === 'llm' && deterministicPlan.status === 'ready') {
    if (config.model_id === null) {
      llmWarnings.push(LLM_PLANNER_OFF_WARNING)
    } else {
      const judged = await runLlmPlanner({
        context: deterministicPlan.context,
        model: config.model_id,
        effort: config.model_effort,
        generate: deps.generateJudgment,
      })
      if (judged.violations.length > 0) throw new LlmPlanContractError(judged.violations)
      plan = assembleLlmPlan({
        judgment: judged.judgment,
        context: deterministicPlan.context,
        modelId: judged.model,
        meta,
      })
      llm = {
        modelId: judged.model,
        promptRevision: judged.promptRevision,
        attempts: judged.attempts,
        costUsd: judged.costUsd,
        latencyMs: judged.latencyMs,
      }
    }
  }

  const warnings = dedupe([...configWarnings, ...bundle.warnings, ...vision.warnings, ...planWarnings, ...llmWarnings])
  const row = buildRow(bundle, plan, options, warnings, vision.profileNodes, inputFingerprint)
  const persisted = await persistJobPlan(deps, row)

  return {
    jobPlanId: persisted.id,
    outcome: persisted.outcome,
    status: plan.status,
    bundleId: bundle.row.id,
    bundleWait: bundle.binding.bundleWait,
    tradingDay: plan.meta.tradingDay,
    plannerRevision: plan.meta.plannerRevision,
    inputFingerprint,
    warnings,
    vision: vision.summary,
    llm,
    plan,
  }
}
