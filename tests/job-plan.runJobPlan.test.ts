import { describe, expect, it } from 'vitest'
import { JobPlanSchema } from '@/knowledge/schema/job-plan.schema'
import { JobPlanAbortError, REF_MISSING_CAUSES, isNonRetryableJobPlanError } from '@/lib/job-plan/jobPlanErrors'
import { LATEST_BUNDLE_WARNING } from '@/lib/job-plan/loadJobBundle'
import { JobStudyParseError } from '@/lib/job-plan/parseJobStudy'
import { VISION_PROMPT_REVISION } from '@/lib/job-plan/profile-vision/prompt'
import { PLANNER_REVISION } from '@/lib/job-plan/rules'
import { PlannerInputError } from '@/lib/job-plan/runPlanner'
import { CONFIG_MISSING_WARNING, runJobPlan, type JobPlanDeps } from '@/lib/job-plan/runJobPlan'
import { VISION_OFF_WARNING } from '@/lib/job-plan/visionRead'
import {
  VISION_ON,
  cannedGenerate,
  fakeJobPlanDeps,
  partialGenerate,
  type FakeOptions,
} from './helpers/jobPlanDeps'
import { AS_OF_WALL, BUNDLE_ID, REQUEST_ID, RUN_ID, bundleRow, inSession } from './helpers/jobPlanFiles'
import { fixture, mutate } from './helpers/jobStudy'

/**
 * runJobPlan (feat-128) with fake deps over every taxonomy branch, the
 * fulfilling-bundle binding, the write contract, and the R14 vision paths.
 */

/** `bundleRequestId: null` = a test run without a request (a dashboard run always carries one). */
/** The daily export 29 minutes before the weekly one: parses (bars precede the export) but trips R13's 5-minute skew. */
function skewedDaily(): string {
  return mutate(inSession(fixture('daily.json')), (doc) => {
    doc.meta.exportedAt = '2026-08-24T09:00:00'
    doc.meta.lastBarTime = '2026-08-24T08:59:00'
  })
}

const run = (options: FakeOptions = {}, bundleRequestId: string | null = REQUEST_ID) => {
  const fake = fakeJobPlanDeps(options)
  return {
    ...fake,
    result: runJobPlan(fake.deps, { runId: RUN_ID, triggerReason: 'manual', bundleRequestId: bundleRequestId ?? undefined }),
  }
}

async function abortsWith(options: FakeOptions, code: JobPlanAbortError['code'], bundleRequestId: string | null = REQUEST_ID) {
  const { result, state } = run(options, bundleRequestId)
  const error = await result.catch((e: unknown) => e)
  expect(error).toBeInstanceOf(JobPlanAbortError)
  expect((error as JobPlanAbortError).code).toBe(code)
  expect(isNonRetryableJobPlanError(error)).toBe(true)
  expect(state.inserted).toEqual([])
  expect(state.generateCalls).toEqual([])
  return error as JobPlanAbortError
}

describe('runJobPlan: the ready path', () => {
  it('binds to the bundle the request was fulfilled with, plans on it, and persists one ready row', async () => {
    const { result, state } = run()
    const out = await result
    expect(out).toMatchObject({
      outcome: 'persisted',
      status: 'ready',
      bundleId: BUNDLE_ID,
      bundleWait: 'fulfilled',
      tradingDay: '2026-08-24',
      plannerRevision: PLANNER_REVISION,
      jobPlanId: 'plan-1',
    })
    expect(state.fetchedById).toEqual([BUNDLE_ID])
    expect(state.latestFetches).toBe(0)
    expect(state.inserted).toHaveLength(1)
    const row = state.inserted[0]
    expect(row).toMatchObject({
      bundle_id: BUNDLE_ID,
      trading_day: '2026-08-24',
      trigger_reason: 'manual',
      status: 'ready',
      planner_revision: PLANNER_REVISION,
      run_id: RUN_ID,
      profile_nodes: null,
    })
    expect(row.input_fingerprint).toMatch(/^[0-9a-f]{64}$/)
    expect(row.input_fingerprint).toBe(out.inputFingerprint)
    expect(JobPlanSchema.safeParse(row.plan).success).toBe(true)
    expect(row.plan.meta).toMatchObject({ bundleId: BUNDLE_ID, inputFingerprint: out.inputFingerprint, asOf: AS_OF_WALL, visionModelId: null, visionPromptRevision: null })
    for (const hash of Object.values(row.plan.meta.sourceHashes)) expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.warnings).toEqual(out.warnings)
    expect(row.warnings).not.toContain(LATEST_BUNDLE_WARNING)
  })

  it('derives asOf from received_at on the exchange wall clock (CDT in August, CST in January)', async () => {
    const { result } = run()
    expect((await result).plan.meta.asOf).toBe(AS_OF_WALL)
    // 15:30Z in January is 09:30 CST — the study fixture is dated 2026-08-24, so the
    // planner flags the day mismatch, but the clock conversion itself is what is under test.
    const winter = run({ row: bundleRow({ received_at: '2026-01-15T15:30:00Z' }) })
    expect((await winter.result).plan.meta.asOf).toBe('2026-01-15T09:30:00')
  })

  it('writes the row only after computation completes and never reaches for anything else', async () => {
    const { result, state } = run({ config: VISION_ON })
    await result
    const insertAt = state.calls.indexOf('insertJobPlan')
    expect(insertAt).toBe(state.calls.length - 1)
    expect(state.calls.indexOf('generate')).toBeLessThan(insertAt)
    expect(state.calls.indexOf('uploadImage')).toBeLessThan(insertAt)
    expect(state.calls.indexOf('fetchJobPlanByRunId')).toBeLessThan(insertAt)
    const known: (keyof JobPlanDeps)[] = ['waitForBundle', 'fetchBundleById', 'fetchLatestBundle', 'downloadObject', 'uploadImage', 'fetchConfig', 'fetchJobPlanByRunId', 'insertJobPlan', 'generate', 'rasterize']
    for (const call of state.calls) expect(known).toContain(call)
    // No dep, row column or call names briefings / entry_levels / push.
    const surface = [...state.calls, ...Object.keys(state.inserted[0])].join(' ')
    expect(surface).not.toMatch(/briefing|entry_level|push/i)
  })

  it('is deterministic: the same inputs produce the same fingerprint and plan', async () => {
    const a = await run().result
    const b = await run().result
    expect(a.inputFingerprint).toBe(b.inputFingerprint)
    expect(a.plan).toEqual(b.plan)
  })

  it('a config row missing reads as vision OFF with a warning, never a failure', async () => {
    const { result, state } = run({ config: null })
    const out = await result
    expect(out.status).toBe('ready')
    expect(out.warnings).toContain(CONFIG_MISSING_WARNING)
    expect(state.generateCalls).toEqual([])
  })
})

describe('runJobPlan: fresh-bundle binding', () => {
  it('a run without a bundleRequestId plans on the latest bundle and says so loudly', async () => {
    const { result, state } = run({}, null)
    const out = await result
    expect(out.bundleWait).toBe('not-requested')
    expect(out.warnings).toContain(LATEST_BUNDLE_WARNING)
    expect(state.latestFetches).toBe(1)
    expect(state.fetchedById).toEqual([])
    expect(state.inserted[0].warnings).toContain(LATEST_BUNDLE_WARNING)
  })

  it('a timed-out wait aborts non-retryably with an operator-remediable message', async () => {
    const error = await abortsWith({ wait: { outcome: 'timed-out' } }, 'bundle_wait_timed_out')
    expect(error.message).toContain('request a fresh bundle')
    expect(error.message).toContain(REQUEST_ID)
  })

  it('a missing request row aborts', async () => {
    await abortsWith({ wait: { outcome: 'missing' } }, 'bundle_request_missing')
  })

  it('a request fulfilled without a bundle id aborts', async () => {
    await abortsWith({ wait: { outcome: 'fulfilled', bundleId: null } }, 'bundle_unfulfilled')
  })

  it('a fulfilling bundle that no longer exists aborts (never falls back to latest)', async () => {
    const { result, state } = run({ wait: { outcome: 'fulfilled', bundleId: '33333333-3333-4333-8333-333333333333' } })
    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(JobPlanAbortError)
    expect((error as JobPlanAbortError).code).toBe('bundle_not_found')
    expect(state.latestFetches).toBe(0)
    expect(state.inserted).toEqual([])
  })

  it('no bundle at all (test run) aborts', async () => {
    await abortsWith({ row: null }, 'bundle_not_found', null)
  })
})

describe('runJobPlan: the error taxonomy', () => {
  it.each([
    ['job_study_daily_ref', 'Job daily study'],
    ['job_study_weekly_ref', 'Job weekly study'],
    ['balance_area_vbp_ref', 'balance-area'],
    ['rotation_vbp_ref', '400-pt rotation'],
    ['exec_csv_ref', 'execution-bar'],
    ['htf_csv_ref', 'HTF'],
  ] as const)('a NULL %s aborts naming the export, the two usual causes and the remedy', async (column, what) => {
    const error = await abortsWith({ row: bundleRow({ [column]: null }) }, 'bundle_ref_missing')
    expect(error.message).toContain(column)
    expect(error.message).toContain(what)
    expect(error.message).toContain(REF_MISSING_CAUSES)
    expect(error.message).toContain('exporter')
    expect(error.message).toContain('Windows uploader checkout')
    expect(error.message).toContain('request a fresh bundle')
  })

  it('a bundle without mgi_json aborts', async () => {
    await abortsWith({ row: bundleRow({ mgi_json: null }) }, 'bundle_invalid')
  })

  it('a bundle without received_at aborts (no asOf to plan against)', async () => {
    await abortsWith({ row: bundleRow({ received_at: null }) }, 'bundle_invalid')
  })

  it('an unsupported job-study schema version throws the parse error, non-retryable, before any model call', async () => {
    const { result, state } = run({ config: VISION_ON, texts: { jobStudyDaily: inSession(fixture('daily.schema-v2.json')) } })
    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(JobStudyParseError)
    expect(isNonRetryableJobPlanError(error)).toBe(true)
    expect(state.generateCalls).toEqual([])
    expect(state.inserted).toEqual([])
  })

  it('an MGI export that is not JSON throws the planner input error, non-retryable', async () => {
    const { result, state } = run({ row: bundleRow({ mgi_json: 'not an object' }) })
    const error = await result.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(PlannerInputError)
    expect(isNonRetryableJobPlanError(error)).toBe(true)
    expect(state.inserted).toEqual([])
  })

  it('a profile export that does not parse aborts as profile_unsupported', async () => {
    const error = await abortsWith({ texts: { rotationProfile: '# not a profile\n' } }, 'profile_unsupported')
    expect(error.message).toContain('400-pt rotation')
  })

  it('geometry that parses but is insufficient (R13 skew) is PERSISTED as insufficient with reasons, not thrown', async () => {
    const skewed = skewedDaily()
    const { result, state } = run({ texts: { jobStudyDaily: skewed } })
    const out = await result
    expect(out.status).toBe('insufficient')
    expect(out.outcome).toBe('persisted')
    expect(state.inserted).toHaveLength(1)
    expect(state.inserted[0].status).toBe('insufficient')
    expect(state.inserted[0].plan.plays).toEqual([])
    expect(state.inserted[0].plan.standDownReasons.join(' ')).toMatch(/skew/i)
  })

  it('a generic dep failure (transient) is NOT in the non-retryable set', () => {
    expect(isNonRetryableJobPlanError(new Error('ECONNRESET'))).toBe(false)
  })
})

describe('runJobPlan: the write contract', () => {
  it('a retry of the same run upserts its own row (same run_id)', async () => {
    const first = await run().result
    const { result, state } = run({ existing: { id: first.jobPlanId, status: 'ready' } })
    const second = await result
    expect(second.outcome).toBe('persisted')
    expect(state.inserted[0].run_id).toBe(RUN_ID)
    expect(state.inserted[0].input_fingerprint).toBe(first.inputFingerprint)
  })

  it('an insufficient result never overwrites a persisted ready row', async () => {
    const skewed = skewedDaily()
    const { result, state } = run({ texts: { jobStudyDaily: skewed }, existing: { id: 'plan-ready', status: 'ready' } })
    const out = await result
    expect(out.status).toBe('insufficient')
    expect(out.outcome).toBe('kept-ready')
    expect(out.jobPlanId).toBe('plan-ready')
    expect(state.inserted).toEqual([])
  })

  it('overlapping attempts: when the database keeps the ready row (trigger), the outcome says so', async () => {
    // The pre-read saw no row (the other attempt had not written yet); the upsert then
    // hit the keep-ready trigger and RETURNING reported the ready row.
    const { result, state } = run({ texts: { jobStudyDaily: skewedDaily() }, persistedStatus: 'ready' })
    const out = await result
    expect(out.status).toBe('insufficient')
    expect(out.outcome).toBe('kept-ready')
    expect(state.inserted).toHaveLength(1)
  })

  it('a ready result replaces a persisted insufficient row', async () => {
    const { result, state } = run({ existing: { id: 'plan-insufficient', status: 'insufficient' } })
    const out = await result
    expect(out.outcome).toBe('persisted')
    expect(state.inserted).toHaveLength(1)
  })
})

describe('runJobPlan: the vision read (R14)', () => {
  it('vision OFF (NULL model id): no model call, profileNodes null, warning, plan still ready', async () => {
    const { result, state } = run()
    const out = await result
    expect(state.generateCalls).toEqual([])
    expect(state.uploads.size).toBe(0)
    expect(out.vision).toBeNull()
    expect(out.status).toBe('ready')
    expect(out.warnings).toContain(VISION_OFF_WARNING)
    expect(out.warnings.some((w) => w.startsWith('profile_nodes_unavailable'))).toBe(true)
    expect(state.inserted[0].profile_nodes).toBeNull()
  })

  it('vision ON: reads both profiles with the config model/effort/samples, uploads the PNGs by hash, persists the read', async () => {
    const { result, state } = run({ config: VISION_ON })
    const out = await result
    expect(out.status).toBe('ready')
    expect(state.generateCalls.length).toBe(2 * VISION_ON.profile_vision_samples)
    expect(state.generateCalls.every((c) => c.model === VISION_ON.profile_vision_model_id)).toBe(true)

    const nodes = state.inserted[0].profile_nodes
    expect(nodes).not.toBeNull()
    expect(nodes).toMatchObject({ modelId: VISION_ON.profile_vision_model_id, effort: 'low', samples: 3, promptRevision: VISION_PROMPT_REVISION })
    expect(nodes!.profiles['balance']!.consensus).not.toBeNull()
    expect(nodes!.profiles['rotation']!.consensus).not.toBeNull()
    expect(nodes!.profiles['balance']!.raw).toHaveLength(3)

    const hashes = Object.values(nodes!.profiles).flatMap((p) => p.imageHashes)
    expect(hashes.length).toBeGreaterThanOrEqual(2)
    expect([...state.uploads.keys()].sort()).toEqual(hashes.map((h) => `${h}.png`).sort())

    expect(out.plan.meta).toMatchObject({ visionModelId: VISION_ON.profile_vision_model_id, visionPromptRevision: VISION_PROMPT_REVISION })
    expect(out.vision).toMatchObject({ modelId: VISION_ON.profile_vision_model_id, effort: 'low', samples: 3, calls: 6, successfulCalls: 6, usage: { inputTokens: 600, outputTokens: 120, totalTokens: 720 } })
    expect(out.vision!.costUsd).toBeCloseTo(0.06, 10)
    expect(out.vision!.agreement['balance']).toMatchObject({ successfulSamples: 3, samples: 3, meanAgreement: 1 })
    expect(out.warnings.some((w) => w.startsWith('profile_nodes_unavailable'))).toBe(false)
    // The profile nodes reached the planner as references.
    expect(out.plan.geometryRefs.references.some((r) => /balance|profile/i.test(r.source))).toBe(true)
  })

  it('the fingerprint covers the vision read: OFF and ON differ on identical files', async () => {
    const off = await run().result
    const on = await run({ config: VISION_ON }).result
    expect(off.inputFingerprint).not.toBe(on.inputFingerprint)
    expect(off.plan.meta.sourceHashes).toEqual(on.plan.meta.sourceHashes)
  })

  it('vision PARTIAL: a profile whose calls fail gets consensus null + its warning; the other profile and the plan survive', async () => {
    const { result, state } = run({ config: VISION_ON, generate: partialGenerate })
    const out = await result
    expect(out.status).toBe('ready')
    const nodes = state.inserted[0].profile_nodes!
    expect(nodes.profiles['balance']!.consensus).not.toBeNull()
    expect(nodes.profiles['rotation']!.consensus).toBeNull()
    expect(nodes.profiles['rotation']!.raw.every((r) => !r.ok && r.error?.includes('503'))).toBe(true)
    expect(out.warnings).toContain('profile_nodes_unavailable:rotation')
    expect(out.vision).toMatchObject({ calls: 6, successfulCalls: 3 })
  })

  it('an image upload failure is a warning, never a failed run', async () => {
    const { result, state } = run({
      config: VISION_ON,
      generate: cannedGenerate,
      uploadImage: async () => {
        throw new Error('storage 500')
      },
    })
    const out = await result
    expect(out.status).toBe('ready')
    expect(out.warnings.filter((w) => w.startsWith('image_upload_failed:')).length).toBeGreaterThanOrEqual(2)
    expect(state.inserted).toHaveLength(1)
  })
})
