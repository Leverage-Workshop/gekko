import type { JobPlan, PlanStatus } from '@/knowledge/schema/job-plan.schema'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import { DEFAULT_PROFILE_VISION_SAMPLES } from '@/lib/config/fetchConfig'
import { computeInputFingerprint, sourceHashesOf } from './fingerprint'
import { JobPlanAbortError } from './jobPlanErrors'
import { loadJobBundle, type LoadJobBundleDeps, type LoadedJobBundle, type BundleWaitOutcome } from './loadJobBundle'
import { parseJobStudy } from './parseJobStudy'
import { instrumentFromSymbol, type Instrument } from './profile-vision/instrument'
import type { FewShotExample } from './profile-vision/prompt'
import type { ProfileKey, ProfileNodes } from './profile-vision/types'
import { PLANNER_REVISION } from './rules'
import { parseMgiJson, runPlanner } from './runPlanner'
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
 * wrapper. HARD LIMITS: the vision read is the only LLM use; nothing here
 * touches `briefings` / `entry_levels`; no push.
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
  /** The vision model call — the ONLY LLM use in the run. */
  generate: JobPlanVisionGenerate
  /** Test overrides for the render → PNG step and the few-shot set. */
  rasterize?: (svg: string) => Uint8Array
  fewShot?: readonly FewShotExample[]
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
  readonly plan: JobPlan
}

export const CONFIG_MISSING_WARNING =
  'config row missing — profile vision read OFF (no model id to read with)'

const VISION_OFF_CONFIG: JobPlanConfig = {
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: DEFAULT_PROFILE_VISION_SAMPLES,
}

type Preflight = {
  readonly instrument: Instrument
  readonly currentPrice: number | null
  readonly profiles: Readonly<Record<ProfileKey, VbpProfile>>
}

function parseProfile(text: string, what: string): VbpProfile {
  try {
    // The Sierra job-plan exporter omits zero-volume rows (feat-131).
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
 * `profile_unsupported` — all non-retryable.
 */
export function preflightParse(texts: LoadedJobBundle['texts']): Preflight {
  const study = parseJobStudy({ daily: texts.jobStudyDaily, weekly: texts.jobStudyWeekly })
  const mgi = parseMgiJson(texts.mgi)
  const symbol = mgi.symbol?.trim() ?? ''
  const fromMgi = symbol.length > 0 ? instrumentFromSymbol(symbol) : null
  return {
    instrument: fromMgi ?? study.instrument,
    currentPrice: mgi.current?.price ?? null,
    profiles: {
      '5d': parseProfile(texts.fiveDayProfile, '5-day rolling volume profile'),
      '4h': parseProfile(texts.fourHourProfile, '4-hour rolling volume profile'),
    },
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
    planner_revision: PLANNER_REVISION,
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
    ...(deps.fewShot ? { fewShot: deps.fewShot } : {}),
  })
}

export async function runJobPlan(deps: JobPlanDeps, options: RunJobPlanOptions): Promise<JobPlanRunResult> {
  const configRow = await deps.fetchConfig()
  const config = configRow ?? VISION_OFF_CONFIG
  const configWarnings = configRow === null ? [CONFIG_MISSING_WARNING] : []

  const bundle = await loadJobBundle(deps, options.bundleRequestId)
  const preflight = preflightParse(bundle.texts)
  const vision = await visionRead(deps, config, preflight, options.visionDeadlineAt)

  const visionModelId = vision.profileNodes?.modelId ?? null
  const visionPromptRevision = vision.profileNodes?.promptRevision ?? null
  const inputFingerprint = computeInputFingerprint({
    sources: bundle.sources,
    plannerRevision: PLANNER_REVISION,
    imageHashes: vision.imageHashes,
    visionPromptRevision,
    visionModelId,
  })

  const { plan, warnings: planWarnings } = runPlanner({
    files: bundle.texts,
    profileNodes: vision.profileNodes,
    asOf: bundle.asOf,
    meta: {
      bundleId: bundle.row.id,
      inputFingerprint,
      sourceHashes: sourceHashesOf(bundle.sources),
      visionPromptRevision,
      visionModelId,
    },
  })

  const warnings = dedupe([...configWarnings, ...bundle.warnings, ...vision.warnings, ...planWarnings])
  const row = buildRow(bundle, plan, options, warnings, vision.profileNodes, inputFingerprint)
  const persisted = await persistJobPlan(deps, row)

  return {
    jobPlanId: persisted.id,
    outcome: persisted.outcome,
    status: plan.status,
    bundleId: bundle.row.id,
    bundleWait: bundle.binding.bundleWait,
    tradingDay: plan.meta.tradingDay,
    plannerRevision: PLANNER_REVISION,
    inputFingerprint,
    warnings,
    vision: vision.summary,
    plan,
  }
}
